import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed password
    city: { type: String, required: true },
    address: {
        street: { type: String },
        city: { type: String },
        state: { type: String },
        zip: { type: String },
        country: { type: String }
    },
    paymentMethod: { type: String, enum: ['Credit Card', 'PayPal', 'Cash on Delivery'] }
});


export default mongoose.model('Customer', customerSchema);
