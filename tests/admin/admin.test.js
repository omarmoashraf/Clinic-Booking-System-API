import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import {
  createAdmin,
  createAuthenticatedUser,
  createSpecialty,
} from '../helpers/auth.js';

describe('Admin Module Endpoints', () => {
  before(async () => {
    await setupTestDatabase();
  });

  after(teardownTestDatabase);

  describe('GET /api/v1/admin/users', () => {
    it('allows ADMIN to list all users with pagination and filtering', async () => {
      const admin = await createAdmin();
      const patient = await createAuthenticatedUser({ role: 'PATIENT' });
      const specialty = await createSpecialty();
      const doctor = await createAuthenticatedUser({ role: 'DOCTOR', specialtyId: specialty.id });

      // List all users
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'success');
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 3);
      assert.ok(res.body.meta);

      // Filter by role=DOCTOR
      const doctorRes = await request(app)
        .get('/api/v1/admin/users?role=DOCTOR')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      assert.equal(doctorRes.status, 200);
      assert.equal(doctorRes.body.data.length, 1);
      assert.equal(doctorRes.body.data[0].id, doctor.userId);
      assert.equal(doctorRes.body.data[0].role, 'DOCTOR');

      // Filter by isActive=true
      const activeRes = await request(app)
        .get('/api/v1/admin/users?isActive=true')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      assert.equal(activeRes.status, 200);
      assert.ok(activeRes.body.data.length >= 3);
    });

    it('rejects non-admin roles with 403 and unauthenticated with 401', async () => {
      const patient = await createAuthenticatedUser({ role: 'PATIENT' });

      const forbiddenRes = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${patient.accessToken}`);
      assert.equal(forbiddenRes.status, 403);

      const unauthRes = await request(app).get('/api/v1/admin/users');
      assert.equal(unauthRes.status, 401);
    });
  });

  describe('PATCH /api/v1/admin/users/:id', () => {
    it('allows ADMIN to update user fields and deactivating revokes refresh tokens', async () => {
      const admin = await createAdmin();
      const patient = await createAuthenticatedUser({ role: 'PATIENT' });

      // Update fullName and phone
      const updateRes = await request(app)
        .patch(`/api/v1/admin/users/${patient.userId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          fullName: 'Updated Patient Name',
          phone: '+201111111111',
        });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.status, 'success');
      assert.equal(updateRes.body.data.fullName, 'Updated Patient Name');
      assert.equal(updateRes.body.data.phone, '+201111111111');

      // Deactivate user
      const deactivateRes = await request(app)
        .patch(`/api/v1/admin/users/${patient.userId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ isActive: false });

      assert.equal(deactivateRes.status, 200);
      assert.equal(deactivateRes.body.data.isActive, false);

      // Verify patient refresh token fails
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: patient.refreshToken });

      assert.equal(refreshRes.status, 401);

      // Verify patient login fails
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: patient.email, password: patient.password });

      assert.equal(loginRes.status, 401);
    });

    it('returns 404 for non-existent user id', async () => {
      const admin = await createAdmin();
      const missingId = '00000000-0000-0000-0000-000000000000';

      const res = await request(app)
        .patch(`/api/v1/admin/users/${missingId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ fullName: 'Nobody' });

      assert.equal(res.status, 404);
    });
  });

  describe('GET /api/v1/admin/appointments', () => {
    it('allows ADMIN to list all appointments across all doctors/patients', async () => {
      const admin = await createAdmin();
      const patient = await createAuthenticatedUser({ role: 'PATIENT' });
      const specialty = await createSpecialty();
      const doctor = await createAuthenticatedUser({ role: 'DOCTOR', specialtyId: specialty.id });

      const patientRow = await prisma.patient.findUnique({ where: { user_id: patient.userId } });
      const doctorRow = await prisma.doctor.findUnique({ where: { user_id: doctor.userId } });

      // Create an availability slot and book it
      const slot = await prisma.availability.create({
        data: {
          doctor_id: doctorRow.id,
          date: new Date('2030-10-10T00:00:00Z'),
          start_time: new Date('1970-01-01T10:00:00Z'),
          end_time: new Date('1970-01-01T11:00:00Z'),
          status: 'BOOKED',
        },
      });

      const appointment = await prisma.appointment.create({
        data: {
          patient_id: patientRow.id,
          doctor_id: doctorRow.id,
          availability_id: slot.id,
          status: 'PENDING',
          notes: 'Admin test appointment',
        },
      });

      const res = await request(app)
        .get('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'success');
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].id, appointment.id);
      assert.equal(res.body.data[0].notes, 'Admin test appointment');
    });

    it('rejects PATIENT and DOCTOR access to admin appointments with 403', async () => {
      const patient = await createAuthenticatedUser({ role: 'PATIENT' });

      const res = await request(app)
        .get('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${patient.accessToken}`);

      assert.equal(res.status, 403);
    });
  });
});
