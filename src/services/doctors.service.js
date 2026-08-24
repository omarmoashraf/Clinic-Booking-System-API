import * as doctorRepo from '../repositories/doctor.repository.js'
import * as specialtyRepo from '../repositories/specialty.repository.js'
import { NotFoundError } from '../errors/AppError.js'

// Public shape of a doctor per docs/API.md: { id, fullName, specialty, bio }.
// Keeps account/auth fields (email, password hash, role flags) out of responses.
const toPublicDoctor = (doctor) => ({
  id: doctor.id,
  fullName: doctor.user.full_name,
  specialty: {
    id: doctor.specialty.id,
    name: doctor.specialty.name,
  },
  bio: doctor.bio,
});

export const list = async ({page, limit, specialty}) =>{
    const {doctors, total} = await doctorRepo.findMany({
        page,
        limit,
        specialty,
    });

    return{
        doctors: doctors.map(toPublicDoctor),
        meta:{
            page,
            limit,
            total,
            totalPages: Math.ceil(total/limit),
        },
    };
};

export const getById = async (id) => {
    const doctor = await doctorRepo.findById(id);
    if(!doctor){
        throw new NotFoundError('Doctor');
    }

    return toPublicDoctor(doctor);
};

/**
 * Self-service profile update.
 * The Doctor row is resolved from the authenticated user id (req.user.id),
 * never from client input, so a doctor can only ever update their own profile.
 */
export const updateOwnProfile = async (userId, {bio, specialtyId}) => {
    const doctor = await doctorRepo.findByUserId(userId);
    if(!doctor){
        throw new NotFoundError('Doctor');
    }

    if(specialtyId !== undefined){
        const specialty = await specialtyRepo.findById(specialtyId);
        if(!specialty){
            throw new NotFoundError('Specialty');
        }
    }

    const updatedDoctor = await doctorRepo.update(doctor.id, {
        ...(bio !== undefined && { bio }),
        ...(specialtyId !== undefined && { specialty_id: specialtyId }),
    });

    return toPublicDoctor(updatedDoctor);
};
