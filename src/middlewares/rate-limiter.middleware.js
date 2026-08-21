import { RateLimiterMemory } from 'rate-limiter-flexible';
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

export const loginRateLimiter = createRateLimiter(10, 15 * 60);

export const registerRateLimiter = createRateLimiter(5, 60 * 60);

export const refreshRateLimiter = createRateLimiter(20, 15 * 60);