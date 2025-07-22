import Protected from '@/components/protected';

export default function AdminDashboard() {
  return (
    <Protected role="admin">
      <div className="p-4 text-red-500">Admin Panel - Authorized Users Only</div>
    </Protected>
  );
}
