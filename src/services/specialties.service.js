import * as specialtyRepo from '../repositories/specialty.repository.js'
import { NotFoundError, ConflictError } from '../errors/AppError.js'
import * as doctorRepo from '../repositories/doctor.repository.js'


export const list = async ({page, limit, search}) =>{
    const {specialties, total} = await specialtyRepo.findAll({
        page,
        limit,
        search,
    });

    return{
        specialties,
        total,
        meta:{
            page,
            limit,
            total,
            totalPages: Math.ceil(total/limit),
        },
    };
};

export const create = async (name) => {
    const existingSpecialty = await specialtyRepo.findByName(name);
    if(existingSpecialty){
        throw new ConflictError('Specialty with this name already exists');
    }
    return specialtyRepo.createSpecialty({name});
};

export const getById = async(id) =>{
    const specialty = await specialtyRepo.findById(id);
    if(!specialty){
        throw new NotFoundError('specialty not found');
    }

    return specialty ;
}

export const update = async(id,name) =>{
    const specialty = await specialtyRepo.findById(id);
    if(!specialty){
        throw new NotFoundError('Specialty not found');
    }

    const existingSpecialty = await specialtyRepo.findByName(name);

      if (existingSpecialty && existingSpecialty.id !== id) {
    throw new ConflictError('Specialty with this name already exists' );
  }


    return specialtyRepo.updateSpecialty(id,{name});
};

export const remove = async(id) =>{
    const specialty = await specialtyRepo.findById(id);
    if(!specialty){
        throw new NotFoundError('specialty not Found');
    }

    const doctorCount = await doctorRepo.countBySpecialtyId(id);

    if(doctorCount > 0){
        throw new ConflictError('Specialty is still assigned to doctors');
    }
    return specialtyRepo.deleteSpecialty(id);
};