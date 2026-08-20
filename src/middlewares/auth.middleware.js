import { verifyAccessToken } from "../utils/jwt.js";
import { UnauthorizedError } from "../errors/AppError.js";
import * as userRepo from '../repositories/user.repository.js'
/**
 * check Authorization headers
 * extract Bearer token
 * verify JWT 
 * validate payload.sub 
 * load user from db 
 * check if user is active
 * attach minimal user data to req.user
 *
 */
export const authenticate = async(req,res,next)=>{
  try{
    const header = req.headers.authorization;
    if(!header || !header.startsWith('Bearer ')){
      throw new UnauthorizedError('Authentication required');
    }

    let payload;
    try{

      payload = verifyAccessToken(header.slice(7));
      if(typeof payload !== 'object' || payload === null
        || typeof payload.sub !== 'string' || payload.sub.length ===0
      ){
        throw new UnauthorizedError('Invalid token')
      }
    }
    catch(error){
      throw new UnauthorizedError('Invalid token');
    }

    const user = await userRepo.findUserById(payload.sub);
    if(!user || !user.is_active){
      throw new UnauthorizedError('Invalid token');
    }

    req.user = {
      id: user.id,
      role: user.role
    }
    next();
  }
  catch(error){
    next(error);
  }
};