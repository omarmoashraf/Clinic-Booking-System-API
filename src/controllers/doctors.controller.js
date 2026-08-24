import * as doctorService from '../services/doctors.service.js'

export const list = async(req,res,next) =>{
    try{
        const {page,limit,specialty} = req.query;
        const {doctors , meta} = await doctorService.list({
            page,
            limit,
            specialty,
        });
        res.status(200).json({
            status: 'success',
            data: doctors,
            meta,

        });

    }
    catch(error){
        next(error);
    }

};

export const getById = async (req,res,next) => {
    try{
        const doctor = await doctorService.getById(req.params.id);
        res.status(200).json({
            status: 'success',
            data: doctor,
        });
    }
    catch(error){
        next(error);
    }
};

export const updateMe = async (req,res,next) =>{
    try{
        const doctor = await doctorService.updateOwnProfile(req.user.id, req.body);
        res.status(200).json({
            status: 'success',
            data: doctor,
        });

    }
    catch(error){
        next(error);
    }
};
