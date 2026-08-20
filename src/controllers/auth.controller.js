import * as authService from '../services/auth.service.js'

export const register = async (req,res,next) =>{
  try{
    const user = await authService.register(req.body);
    res.status(201).json({
      status: 'success',
      data: user
    });
  }
  catch(error){
    next(error);
  }
};

export const login = async (req,res,next) => {
  try{
    const result = await authService.login(req.body.email , req.body.password);
    res.status(200).json({
      status: 'success',
      data: result
    });

  }
  catch(error){
    next(error);
  }
};


export const refresh = async (req,res,next) => {
  try{
    const result = await authService.refresh(req.body.refreshToken);
    res.status(200).json({
      status: 'success',
      data: result
    });
  }
  catch(error){
    next(error);
  }
};


export const logout = async(req,res,next) => {
  try{
    await authService.logout(req.body.refreshToken , req.user.id);
    res.status(204).send();
  }
  catch(error){
    next(error);
  }
};