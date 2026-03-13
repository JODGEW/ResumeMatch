import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'x-api-key': import.meta.env.VITE_API_KEY
  }
});

client.interceptors.request.use(async (config) => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Not authenticated — let the request proceed without token
  }
  return config;
});

export default client;
