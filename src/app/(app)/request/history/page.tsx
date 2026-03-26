'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { BloodRequest } from '@/types';
import { Card, CardBody } from '@/components/ui/Card';
import { BloodGroupBadge, StatusBadge } from '@/components/ui/Badge';
import { Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

export default function RequestHistoryPage() {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('blood_requests')
        .select('*')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });

      setRequests((data as BloodRequest[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-offwhite pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 pt-12 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Request History</h1>
        <p className="text-sm text-gray-500 mt-1">All your blood requests</p>
      </div>

      <div className="px-4 py-6 space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />
          ))
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-care-50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-blood-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">No requests yet</p>
            <p className="text-sm text-gray-400 mt-1">Your blood requests will appear here</p>
            <Link
              href="/request/create"
              className="mt-6 inline-block px-6 py-3 bg-blood-600 text-white rounded-xl font-semibold text-sm"
            >
              Create Emergency Request
            </Link>
          </div>
        ) : (
          <AnimatePresence>
            {requests.map((req, i) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link href={`/request/${req.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardBody>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <BloodGroupBadge group={req.blood_group} size="lg" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{req.hospital_name}</p>
                            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                              <span>{req.hospital_address}</span>
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                              <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
                                {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                              </span>
                              {req.units_needed && (
                                <span>{req.units_needed} unit{req.units_needed > 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={req.status} />
                      </div>

                      {req.notes && (
                        <p className="mt-3 text-sm text-gray-600 bg-neutral-offwhite rounded-lg px-3 py-2 line-clamp-2">
                          {req.notes}
                        </p>
                      )}
                    </CardBody>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
