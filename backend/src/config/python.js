import './env.js';
import axios from 'axios';

// Shared client for the Python RAG API. The shared secret keeps the Python
// service from being called directly by anyone other than this backend.
export const pythonApi = axios.create({
  baseURL: (process.env.PYTHON_API_URL || '').replace(/\/$/, ''),
  headers: process.env.INTERNAL_API_KEY ? { 'X-Internal-Key': process.env.INTERNAL_API_KEY } : {},
});
