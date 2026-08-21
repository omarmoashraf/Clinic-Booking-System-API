import { ForbiddenError } from "../errors/AppError.js";

// use after auth.middleware

export const requireRole = (...roles) =>(req,res,next)=>{
  if(!req.user || !roles.includes(req.user.role)){
    return next(new ForbiddenError('Insufficient Permissions'))
  }
  next();
}