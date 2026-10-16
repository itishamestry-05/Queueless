import { api } from './client.js';

// Public: doctors and free time slots.
export const apiListDoctors = (specialty) =>
  api.get('/doctors', { params: specialty ? { specialty } : {} }).then(r => r.data);
export const apiAppointmentSlots = ({ service, doctor, date }) =>
  api.get('/appointments/slots', { params: { service, doctor: doctor || undefined, date } }).then(r => r.data);

// Patient portal.
export const apiPatientRegister = (data) => api.post('/patients/register', data).then(r => r.data);
export const apiPatientLogin    = (email, password) => api.post('/patients/login', { email, password }).then(r => r.data);
export const apiPatientProfile  = () => api.get('/patients/me').then(r => r.data);
export const apiUpdatePatientProfile = (data) => api.put('/patients/me', data).then(r => r.data);
export const apiPatientChangePassword = (currentPassword, newPassword) =>
  api.post('/patients/me/change-password', { currentPassword, newPassword }).then(r => r.data);
export const apiPatientAppointments = () => api.get('/patients/me/appointments').then(r => r.data);
export const apiPatientBook = (data) => api.post('/patients/me/appointments', data).then(r => r.data);
export const apiPatientCancel = (id) => api.put(`/patients/me/appointments/${id}/cancel`).then(r => r.data);

// Doctor portal.
export const apiDoctorLogin   = (username, password) => api.post('/doctor/login', { username, password }).then(r => r.data);
export const apiDoctorProfile = () => api.get('/doctor/me').then(r => r.data);
export const apiUpdateDoctorProfile = (data) => api.put('/doctor/me', data).then(r => r.data);
export const apiDoctorChangePassword = (currentPassword, newPassword) =>
  api.post('/doctor/me/change-password', { currentPassword, newPassword }).then(r => r.data);
export const apiDoctorAppointments = (date) =>
  api.get('/doctor/appointments', { params: date ? { date } : {} }).then(r => r.data);
export const apiDoctorSetOutcome = (id, status) =>
  api.put(`/doctor/appointments/${id}/status`, { status }).then(r => r.data);
export const apiDoctorSavePrescription = (id, prescription, complete = false) =>
  api.put(`/doctor/appointments/${id}/prescription`, { ...prescription, complete }).then(r => r.data);

// Admin: doctor management and assignment.
export const apiAdminDoctors      = () => api.get('/admin/doctors').then(r => r.data);
export const apiAdminCreateDoctor = (data) => api.post('/admin/doctors', data).then(r => r.data);
export const apiAdminUpdateDoctor = (username, data) => api.put(`/admin/doctors/${username}`, data).then(r => r.data);
export const apiAdminDeleteDoctor = (username) => api.delete(`/admin/doctors/${username}`).then(r => r.data);
export const apiAssignAppointmentDoctor = (id, doctorId) =>
  api.put(`/admin/appointments/${id}/doctor`, { doctorId }).then(r => r.data);
