import * as  specialtyService from '../services/specialties.service.js'

export const create = async(req,res,next) =>{
    try{
        const specialty = await specialtyService.create(req.body.name);
        res.status(201).json({
            status: 'success',
            data: specialty
        });

    }
    catch(error)
    {
        next(error);

    }
};

export const list = async (req,res,next) => {
    try{
        const {page,limit,search} = req.query;
        const {specialties , meta} = await specialtyService.list({
            page,
            limit,
            search,
        });
        res.status(200).json({
            status: 'success',
            data: specialties,
            meta,
            
        });

    }
    catch(error){
        next(error);
    }
    
};

export const update = async (req,res,next) =>{
    try{
        const specialty = await specialtyService.update(req.params.id , req.body.name);
        res.status(200).json({
            status: 'success',
            data: specialty,
        })

    }
    catch(error){
        next(error);
    }
};

export const getById = async (req,res,next) => {
    try{
        const specialty = await specialtyService.getById(req.params.id);
        res.status(200).json({
            status: 'success',
            data: specialty,
        });
    }
    catch(error){
        next(error);
    }
};

export const remove = async (req,res,next) => {
    try{
         await specialtyService.remove(req.params.id);
        res.status(204).send();

    }
    catch(error){
        next(error);
    }
}
