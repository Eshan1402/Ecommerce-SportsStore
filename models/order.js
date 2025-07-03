import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [
        {
            id: Number,
            name: String,
            price: Number,
            quantity: Number,
            image: String
        }
    ],
    total: { type: Number, required: true },
    status: { type: String, enum: ['Processing', 'Shipped', 'Delivered'], default: 'Processing' },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Order', orderSchema); 