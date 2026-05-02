import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import axios from 'axios';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

/**
 * Wrapper function for pdf-parse v2.x to maintain compatibility with original API
 * @param {Buffer} buffer 
 * @returns {Promise<{text: string, numpages: number, info: any}>}
 */
async function pdf(buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
        const textResult = await parser.getText();
        const infoResult = await parser.getInfo();
        return {
            text: textResult.text,
            numpages: textResult.total,
            info: infoResult.info
        };
    } finally {
        await parser.destroy();
    }
}


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://neelpriyansh:BUHM0hbEryFmL4Aw@cluster0.mtjrnw1.mongodb.net/vitalguard';
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://vital-guard-seven.vercel.app', 'https://legacy-democratic-relax-carmen.trycloudflare.com'],
    credentials: true,
}));
app.use(express.json());

mongoose
    .connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));


const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: 6,
        },
    },
    { timestamps: true }
);

const User = mongoose.model('User', userSchema);

const generateToken = (userId) =>
    jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });

// Memory storage for file uploads
const memoryStorage = multer.memoryStorage();
const uploadLocal = multer({ storage: memoryStorage });

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'OK', message: 'VitalGuard API is running' });
});

app.post('/api/upload-report', uploadLocal.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            console.error('No file in request');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        console.log('File received:', req.file.originalname, req.file.size, 'bytes');

        // Parse PDF directly from buffer
        const pdfBuffer = req.file.buffer;
        const data = await pdf(pdfBuffer);

        console.log('PDF parsed successfully - pages:', data.numpages);

        res.status(200).json({
            message: 'File uploaded and parsed successfully',
            text: data.text,
            pdf: { filename: req.file.originalname, numpages: data.numpages, info: data.info },
        });
    } catch (error) {
        console.error('Error parsing file:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ 
            message: 'Error processing file. Please try again.',
            error: error.message 
        });
    }
});

// SIGNUP
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (password.length < 6) {
            return res
                .status(400)
                .json({ message: 'Password must be at least 6 characters' });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'Email already registered' });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        const token = generateToken(user._id);

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res
                .status(400)
                .json({ message: 'Email and password are required' });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = generateToken(user._id);

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
});
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 VitalGuard backend running hahaha on http://localhost:${PORT}`);
});
