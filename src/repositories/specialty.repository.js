import prisma from '../lib/prisma.js';

export const findById = (id, client = prisma) => {
  return client.specialty.findUnique({ where: { id } });
};

export const findByName = (name , client = prisma) =>{
  return client.specialty.findUnique({where: {name}});
}

export const findAll = async (
  { page = 1, limit = 10, search },
  client = prisma
) => {
  const skip = (page - 1) * limit;

  const where = search
    ? {
        name: {
          contains: search,
          mode: 'insensitive',
        },
      }
    : {};

  const [specialties, total] = await Promise.all([
    client.specialty.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    client.specialty.count({
      where,
    }),
  ]);

  return {
    specialties,
    total,
  };
};


export const createSpecialty = (data , client = prisma) =>{
  return client.specialty.create({data});
};

export const updateSpecialty = (id , data , client = prisma)=>{

  return client.specialty.update({where: {id}, data});
}


export const deleteSpecialty = (id , client = prisma) =>{
  return client.specialty.delete({where: {id}});
}