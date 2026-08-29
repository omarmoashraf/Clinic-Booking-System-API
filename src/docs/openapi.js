export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Clinic Booking API',
    version: '1.0.0',
    description:
      'Backend REST API for managing clinic appointment scheduling. Patients browse doctors, check availability, and book/cancel appointments. Doctors manage availability and appointment status. Admins manage users, doctors, and specialties.',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 Base Endpoint',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your short-lived access token (JWT)',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'error' },
          message: { type: 'string', example: 'Invalid credentials or resource not found' },
        },
      },
      ValidationErrorResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'validation_error' },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'email' },
                message: { type: 'string', example: 'must be a valid email' },
              },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          fullName: { type: 'string' },
          phone: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['PATIENT', 'DOCTOR', 'ADMIN'] },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DoctorProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          fullName: { type: 'string' },
          specialty: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
            },
          },
          bio: { type: 'string', nullable: true },
        },
      },
      Specialty: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      AvailabilitySlot: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          date: { type: 'string', example: '2026-09-01' },
          startTime: { type: 'string', example: '09:30' },
          endTime: { type: 'string', example: '11:00' },
        },
      },
      Appointment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] },
          notes: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          patient: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              fullName: { type: 'string' },
            },
          },
          doctor: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              fullName: { type: 'string' },
              specialty: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                },
              },
            },
          },
          availability: {
            $ref: '#/components/schemas/AvailabilitySlot',
          },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          total: { type: 'integer', example: 42 },
          totalPages: { type: 'integer', example: 5 },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health Check',
        tags: ['System'],
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', example: 'success' } },
                },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register a new patient or doctor',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'fullName', 'role'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8, maxLength: 72 },
                  fullName: { type: 'string' },
                  phone: { type: 'string' },
                  role: { type: 'string', enum: ['PATIENT', 'DOCTOR'] },
                  specialtyId: { type: 'string', format: 'uuid', description: 'Required for DOCTOR' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Registration successful' },
          '400': { $ref: '#/components/schemas/ValidationErrorResponse' },
          '409': { description: 'Email already registered' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate and receive access + refresh tokens',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Invalid email or password' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate refresh token for new access token',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Tokens rotated' },
          '401': { description: 'Invalid or revoked token' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Revoke session refresh token family',
        tags: ['Auth'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '204': { description: 'Logged out successfully' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/users/me': {
      get: {
        summary: 'Get current authenticated user profile',
        tags: ['Users'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'User profile retrieved' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/doctors': {
      get: {
        summary: 'Browse doctor directory',
        tags: ['Doctors'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'specialty', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Doctor list' },
        },
      },
    },
    '/doctors/{id}': {
      get: {
        summary: 'Get doctor detail',
        tags: ['Doctors'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Doctor detail' },
          '404': { description: 'Doctor not found' },
        },
      },
    },
    '/doctors/me': {
      patch: {
        summary: 'Update own doctor profile',
        tags: ['Doctors'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  bio: { type: 'string' },
                  specialtyId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Doctor profile updated' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/patients/me': {
      patch: {
        summary: 'Update own patient profile',
        tags: ['Patients'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fullName: { type: 'string' },
                  phone: { type: 'string' },
                  dateOfBirth: { type: 'string', example: '1995-06-15' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Patient profile updated' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/specialties': {
      get: {
        summary: 'List specialties',
        tags: ['Specialties'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Specialty list' },
        },
      },
      post: {
        summary: 'Create specialty (ADMIN)',
        tags: ['Specialties'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Specialty created' },
          '403': { description: 'Forbidden' },
          '409': { description: 'Name conflict' },
        },
      },
    },
    '/specialties/{id}': {
      get: {
        summary: 'Get specialty detail',
        tags: ['Specialties'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Specialty detail' },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        summary: 'Update specialty (ADMIN)',
        tags: ['Specialties'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Specialty updated' },
          '403': { description: 'Forbidden' },
          '409': { description: 'Name conflict' },
        },
      },
      delete: {
        summary: 'Delete specialty (ADMIN)',
        tags: ['Specialties'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Deleted' },
          '409': { description: 'Doctor still assigned' },
        },
      },
    },
    '/doctors/{doctorId}/availability': {
      get: {
        summary: 'List available slots for a doctor',
        tags: ['Availability'],
        parameters: [
          { name: 'doctorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', example: '2026-09-01' } },
          { name: 'to', in: 'query', schema: { type: 'string', example: '2026-09-30' } },
        ],
        responses: {
          '200': { description: 'Available slots' },
        },
      },
    },
    '/doctors/me/availability': {
      post: {
        summary: 'Create an availability slot (DOCTOR)',
        tags: ['Availability'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'startTime', 'endTime'],
                properties: {
                  date: { type: 'string', example: '2026-09-01' },
                  startTime: { type: 'string', example: '09:30' },
                  endTime: { type: 'string', example: '11:00' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Slot created' },
          '409': { description: 'Slot overlap' },
        },
      },
    },
    '/doctors/me/availability/{id}': {
      delete: {
        summary: 'Delete own availability slot (DOCTOR)',
        tags: ['Availability'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Slot deleted' },
          '409': { description: 'Slot is already booked' },
        },
      },
    },
    '/appointments': {
      post: {
        summary: 'Book an appointment against an available slot (PATIENT)',
        tags: ['Appointments'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['availabilityId'],
                properties: {
                  availabilityId: { type: 'string', format: 'uuid' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Appointment booked' },
          '409': { description: 'Slot already booked' },
        },
      },
    },
    '/appointments/me': {
      get: {
        summary: 'List own appointments (PATIENT or DOCTOR)',
        tags: ['Appointments'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] } },
        ],
        responses: {
          '200': { description: 'Appointments list' },
        },
      },
    },
    '/appointments/{id}': {
      get: {
        summary: 'Get appointment details by ID',
        tags: ['Appointments'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Appointment detail' },
          '403': { description: 'Forbidden for non-owners' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/appointments/{id}/status': {
      patch: {
        summary: 'Update appointment status (DOCTOR confirm/complete/cancel, PATIENT cancel)',
        tags: ['Appointments'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['CONFIRMED', 'COMPLETED', 'CANCELLED'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Status updated' },
          '409': { description: 'Invalid status transition or past appointment modification' },
        },
      },
    },
    '/admin/users': {
      get: {
        summary: 'List all users (ADMIN)',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['PATIENT', 'DOCTOR', 'ADMIN'] } },
          { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': { description: 'Users list' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/admin/users/{id}': {
      patch: {
        summary: 'Update user account details / deactivate (ADMIN)',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fullName: { type: 'string' },
                  phone: { type: 'string' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'User updated' },
          '404': { description: 'User not found' },
        },
      },
    },
    '/admin/appointments': {
      get: {
        summary: 'Read-only oversight of all appointments (ADMIN)',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] } },
          { name: 'doctorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'patientId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Appointments list' },
          '403': { description: 'Forbidden' },
        },
      },
    },
  },
};
