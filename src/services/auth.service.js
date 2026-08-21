import crypto from 'node:crypto';
import prisma from '../lib/prisma.js'
import config from '../config/index.js'
import {ConflictError ,NotFoundError, UnauthorizedError} from '../errors/AppError.js'
import * as userRepo from '../repositories/user.repository.js'
import * as refreshTokenRepo from '../repositories/refresh-token.repository.js'
import * as specialtyRepo from '../repositories/specialty.repository.js'
import * as doctorRepo from '../repositories/doctor.repository.js'
import * as patientRepo from '../repositories/patient.repository.js'
import {hashPassword, comparePassword} from '../utils/hash.js'
import {generateAccessToken} from '../utils/jwt.js'

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15*60*1000; // 15 min

// prevent user-enumeration
const DUMMY_PASSWORD_HASH = '$2b$10$3p34nHVOqdiIu8lksE9Fz.5PoYi1b.woZl4faH9NdatHfkW.xyqou';
// hashing function
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

const generateRefreshToken = () => crypto.randomBytes(48).toString('hex');

const publicUser = (user) => ({id:user.id, role: user.role});

const isLockedOut = (user) => {
    if(user.locked_until === null || user.locked_until == undefined){
        return false;
    }
    return user.locked_until.getTime() > Date.now();
};
// create refreshToken and AccessToken
const issueTokens = async(user) =>{
    const refreshToken = generateRefreshToken();

    await refreshTokenRepo.create({
        user_id: user.id,
        family_id: crypto.randomUUID(),
        token_hash: sha256(refreshToken),
        expires_at: new Date(Date.now()+ config.jwt.refreshTokenLifetimeMs),
    });

    return {
        accessToken : generateAccessToken(user),
        refreshToken
    };
};
 /*
 * user provide email and password
 * validate email 
 * hash provided password
 * choose role PATIENT || DOCTOR
 * return created user
 * 
 * 
 
 */
export const register = async ({email, password , fullName , phone , role, specialtyId}) =>{
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await userRepo.findUserByEmail(normalizedEmail);
    if(existing){
        throw new ConflictError('Email already exist');
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) =>{
        const created = await userRepo.createUser({
            email: normalizedEmail,
            password_hash: passwordHash,
            full_name: fullName,
            phone: phone ?? null,
            role,
        },
    tx,
);

if (role === 'DOCTOR'){
    const specialty = await specialtyRepo.findById(specialtyId, tx);
    if(!specialty){
        throw new NotFoundError('Specialty')
    }

    await doctorRepo.create({
        user_id: created.id ,
        specialty_id: specialty.id
    },tx);
}

else{
    await patientRepo.create({
        user_id: created.id,
    },tx);
}

return created;

});

    return publicUser(user);
};

/**
 * LOGIN
 * user provide email and password
 * validate email -> check if email exist
 * compare hashed password with user provided password
 * check if user acount is locked
 * genereate tokens
 */


export const login = async(email,password) =>{
    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepo.findUserByEmail(normalizedEmail);
    
    const passwordMatches = await comparePassword(password, user? user.password_hash : DUMMY_PASSWORD_HASH);

    const locked = user ? isLockedOut(user): false;


    if(!user || !passwordMatches || !user.is_active || locked){
        if(user && !passwordMatches && user.is_active && !locked){
            await recordFailedLogin(user);
        }
        throw new UnauthorizedError('Invalid email or password');
    }


    await userRepo.resetFailedLogins(user.id);
    const tokens = await issueTokens(user);
    return {...tokens, user:publicUser(user)};
};

/**
 * Failed Login Flow
 * wrong password -> increment failed login count-> DB atomic increment
 * -> return new count -> count >=5 ? lock : done
 */
const recordFailedLogin = async(user) =>{

    const updatedUser = await userRepo.incrementFailedLoginCount(user.id);

    if(updatedUser.failed_login_count >= MAX_FAILED_LOGIN_ATTEMPTS){
        await userRepo.setLockout(user.id, new Date(Date.now() + LOCKOUT_DURATION_MS));
    }

};

/**
 * refresh Token flow
 * 
 * find token
   ↓
doesn't exist?
   → 401
   ↓
revoked?
   → revoke family
   → 401
   ↓
expired?
   → 401
   ↓
user exists + active?
   → 401 if not
   ↓
rotate token
 */

export const refresh = async(refreshToken) =>{
    const stored = await refreshTokenRepo.findByTokenHash(sha256(refreshToken));
    if(!stored){
        throw new UnauthorizedError('Invalid refresh token');
    }


    if(stored.revoked_at){
        await refreshTokenRepo.revokeFamily(stored.family_id);
        throw new UnauthorizedError('Invalid refresh token');
        
    }

    if(stored.expires_at.getTime() <= Date.now()){
        throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await userRepo.findUserById(stored.user_id);
    if(!user || !user.is_active){
        throw new UnauthorizedError('Invalid refresh token');
    }

    const newRefreshToken = generateRefreshToken();
    const newTokenHash = sha256(newRefreshToken);

    let reuseDetected = false;


    await prisma.$transaction(async (tx) =>{
        const revoked = await refreshTokenRepo.revokeIfActive(stored.id , newTokenHash, tx);
        if(revoked.count === 0){
            reuseDetected = true;
            await refreshTokenRepo.revokeFamily(stored.family_id,tx);
            return;
        }

        await refreshTokenRepo.create({
            user_id: stored.user_id,
            family_id: stored.family_id,
            token_hash: newTokenHash,
            expires_at: new Date(Date.now() + config.jwt.refreshTokenLifetimeMs),
        },
    tx,);


    });

    if(reuseDetected){
        throw new UnauthorizedError('Invalid refresh token');
    }
    return {
        accessToken: generateAccessToken(user),
        refreshToken: newRefreshToken,
    user: publicUser(user),
}

};


export const logout = async (refreshToken, userId) =>{
    const stored = await refreshTokenRepo.findByTokenHash(sha256(refreshToken));

    if(!stored || stored.user_id !== userId){
        throw new UnauthorizedError('Invalid refresh token');
    }

    await refreshTokenRepo.revokeFamily(stored.family_id);
};
