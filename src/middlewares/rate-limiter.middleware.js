import { RateLimiterMemory } from 'rate-limiter-flexible';
import config from '../config/index.js';
/**
 * point = request
 * key = req.ip
 * each IP has counter
 */
const createRateLimiter = (points, duration) => {
    const limiter = new RateLimiterMemory({
        points,
        duration,
    });

    return async (req, res, next) => {
        try {
            await limiter.consume(req.ip);
            next();
        } catch {
            res.status(429).json({
                message: 'Too many requests. Please try again later.',
            });
        }
    };
};

export const loginRateLimiter = createRateLimiter(config.rateLimit.loginMax, 15 * 60);

export const registerRateLimiter = createRateLimiter(config.rateLimit.registerMax, 60 * 60);

export const refreshRateLimiter = createRateLimiter(config.rateLimit.refreshMax, 15 * 60);