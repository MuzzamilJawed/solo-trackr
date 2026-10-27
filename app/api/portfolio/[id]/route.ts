import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Transaction from '../../../models/Transaction';
import { requireUser, fail } from '../../../lib/apiAuth';
import { normalizeTxn } from '../shape';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { session, response } = await requireUser();
    if (!session) return response;
    const { id } = await params;
    try {
        await dbConnect();
        const result = await Transaction.deleteOne({ _id: id, userId: session.uid });
        if (result.deletedCount === 0) {
            return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: {} });
    } catch (error) {
        console.error('[portfolio] DELETE failed:', error);
        return fail(error, 'Failed to delete the trade');
    }
}

// Edit a trade in place. Same validation as creating one; scoped to the owner.
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { session, response } = await requireUser();
    if (!session) return response;
    const { id } = await params;
    try {
        const body = await request.json();
        const txn = normalizeTxn(body);
        if ('error' in txn) {
            return NextResponse.json({ success: false, error: txn.error }, { status: 400 });
        }
        await dbConnect();
        const updated = await Transaction.findOneAndUpdate(
            { _id: id, userId: session.uid },
            { $set: txn, $unset: txn.note ? {} : { note: '' } },
            { new: true, runValidators: true }
        );
        if (!updated) {
            return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        console.error('[portfolio] PATCH failed:', error);
        return fail(error, 'Failed to update the trade');
    }
}
