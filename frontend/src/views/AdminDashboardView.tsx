import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Zap, 
  Crown, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  RefreshCw, 
  DollarSign, 
  Percent, 
  Send, 
  UserCheck, 
  UserX, 
  Sliders, 
  Copy, 
  Check, 
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Terminal,
  FileText,
  Lock,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { User, EnergyPackageConfig, PremiumPackageConfig } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { ScrolicLogo } from '../components/ScrolicLogo';

interface AdminDashboardViewProps {
  currentUser: User | null;
  onBackToFeed: () => void;
  onRefreshCurrentUser?: () => void;
}

type AdminTab = 'overview' | 'users' | 'energy' | 'premium' | 'withdrawals' | 'broadcast' | 'guide';

interface AdminStats {
  users: {
    total: number;
    admins: number;
    verified: number;
    premium: number;
    banned: number;
  };
  energy: {
    totalInCirculation: number;
    totalAffiliatePending: number;
    activePackagesCount: number;
  };
  withdrawals: {
    pendingCount: number;
    pendingAmountIdr: number;
    processingCount: number;
    completedCount: number;
    completedAmountIdr: number;
    totalCount: number;
  };
  premium: {
    activeTiersCount: number;
  };
}

interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatar: string;
  role: 'user' | 'admin';
  isBanned: boolean;
  energyBalance: number;
  affiliateEarningsEnergy: number;
  tradeEarningsEnergy: number;
  subscriptionTier: string;
  isVerified: boolean;
  kycStatus: string;
  kycFullName: string | null;
  kycNik: string | null;
  winRate: number;
  tradesCount: number;
  followersCount: number;
  referralCode: string;
  cTraderConnected: boolean;
  createdAt: string;
}

interface AdminWithdrawalRow {
  id: string;
  userId: string;
  username: string;
  userDisplayName: string;
  userAvatar: string;
  userEnergyBalance: number;
  amountEnergy: number;
  amountIdr: number;
  feeIdr: number;
  netAmountIdr: number;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  referenceId: string;
  disbursementId?: string;
  notes?: string;
  createdAt: string;
  completedAt?: string;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUser,
  onBackToFeed,
  onRefreshCurrentUser
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Users Tab State
  const [usersList, setUsersList] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [kycFilter, setKycFilter] = useState('ALL');
  const [selectedUserForAction, setSelectedUserForAction] = useState<AdminUserRow | null>(null);
  const [energyAdjustAmount, setEnergyAdjustAmount] = useState<number>(50);
  const [energyAdjustReason, setEnergyAdjustReason] = useState<string>('Bonus Loyalitas Trader');
  const [isAdjustEnergyModalOpen, setIsAdjustEnergyModalOpen] = useState(false);

  // Energy Packages State
  const [energyPackages, setEnergyPackages] = useState<EnergyPackageConfig[]>([]);
  const [globalDiscountInput, setGlobalDiscountInput] = useState<number>(15);
  const [editingEnergyPackage, setEditingEnergyPackage] = useState<EnergyPackageConfig | null>(null);
  const [isAddEnergyPackageOpen, setIsAddEnergyPackageOpen] = useState(false);
  const [newEnergyPkg, setNewEnergyPkg] = useState<{
    energy: number;
    basePriceRp: number;
    discountPercent: number;
    label: string;
    bonus: string;
    isPopular: boolean;
    isActive: boolean;
  }>({
    energy: 1000,
    basePriceRp: 1000000,
    discountPercent: 20,
    label: 'Whale Trader 1000',
    bonus: '+100 Bonus ⚡',
    isPopular: true,
    isActive: true
  });

  // Premium Packages State
  const [premiumPackages, setPremiumPackages] = useState<PremiumPackageConfig[]>([]);
  const [editingPremiumPackage, setEditingPremiumPackage] = useState<PremiumPackageConfig | null>(null);
  const [isAddPremiumPackageOpen, setIsAddPremiumPackageOpen] = useState(false);
  const [newPremiumPkg, setNewPremiumPkg] = useState<{
    tier: 'premium_monthly' | 'premium_3m' | 'premium_6m' | 'premium_yearly';
    name: string;
    durationMonths: number;
    priceEnergy: number;
    basePriceEnergy: number;
    basePriceRp: number;
    discountPercent: number;
    maxGenerations: number;
    totalCommissionPercent: number;
    energyBonus: number;
    features: string[];
    newFeatureInput: string;
    isPopular: boolean;
    isActive: boolean;
  }>({
    tier: 'premium_monthly',
    name: 'Pro Monthly Pass',
    durationMonths: 1,
    priceEnergy: 99,
    basePriceEnergy: 99,
    basePriceRp: 99000,
    discountPercent: 0,
    maxGenerations: 2,
    totalCommissionPercent: 20,
    energyBonus: 0,
    features: [
      'Atur Biaya Unlock Setup & Ikuti Setup (1-10 ⚡)',
      'Buka Hak Komisi Generasi ke-2 (Total 20%)',
      'cTrader Auto-Mirror 1-Click',
      'AI Setup Analysis by Gemini'
    ],
    newFeatureInput: '',
    isPopular: true,
    isActive: true
  });

  // Withdrawals State
  const [withdrawalsList, setWithdrawalsList] = useState<AdminWithdrawalRow[]>([]);
  const [wdStatusFilter, setWdStatusFilter] = useState('ALL');
  const [selectedWdForApprove, setSelectedWdForApprove] = useState<AdminWithdrawalRow | null>(null);
  const [approveDisbursementId, setApproveDisbursementId] = useState('');
  const [approveNotes, setApproveNotes] = useState('');
  const [isApprovingWd, setIsApprovingWd] = useState(false);
  const [selectedWdForReject, setSelectedWdForReject] = useState<AdminWithdrawalRow | null>(null);
  const [rejectReason, setRejectReason] = useState('Nomor rekening bank tidak valid / nama tidak sesuai KTP');

  // Broadcast State
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState('TRADE_OPENED');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  // Promote by Username State (Quick Admin Promoter)
  const [quickPromoteUsername, setQuickPromoteUsername] = useState('');
  const [quickPromoteRole, setQuickPromoteRole] = useState<'admin' | 'user'>('admin');
  const [copiedCode, setCopiedCode] = useState(false);

  const showToast = (type: 'success' | 'error', text: string) => {
    setNotificationMsg({ type, text });
    setTimeout(() => setNotificationMsg(null), 4000);
  };

  // Auth Header helper
  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'x-session-user-id': currentUser?.id || 'user-alex'
  });

  // 1. Fetch Stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch admin stats', err);
    }
  };

  // 2. Fetch Users
  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (userSearch) query.append('search', userSearch);
      if (roleFilter !== 'ALL') query.append('role', roleFilter);
      if (kycFilter !== 'ALL') query.append('kycStatus', kycFilter);

      const res = await fetch(`/api/admin/users?${query.toString()}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.users) {
        setUsersList(data.users);
      }
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Fetch Energy Packages
  const fetchEnergyPackages = async () => {
    try {
      const res = await fetch('/api/admin/energy-packages', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.packages) {
        setEnergyPackages(data.packages);
      }
    } catch (err) {
      console.error('Failed to fetch energy packages', err);
    }
  };

  // 4. Fetch Premium Packages
  const fetchPremiumPackages = async () => {
    try {
      const res = await fetch('/api/admin/premium-packages', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.packages) {
        setPremiumPackages(data.packages);
      }
    } catch (err) {
      console.error('Failed to fetch premium packages', err);
    }
  };

  // 5. Fetch Withdrawals
  const fetchWithdrawals = async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (wdStatusFilter !== 'ALL') query.append('status', wdStatusFilter);

      const res = await fetch(`/api/admin/withdrawals?${query.toString()}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.withdrawals) {
        setWithdrawalsList(data.withdrawals);
      }
    } catch (err) {
      console.error('Failed to fetch withdrawals', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchStats();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'energy') fetchEnergyPackages();
    if (activeTab === 'premium') fetchPremiumPackages();
    if (activeTab === 'withdrawals') fetchWithdrawals();
  }, [activeTab]);

  // Refetch users on search/filter debounce
  useEffect(() => {
    if (activeTab === 'users') {
      const timer = setTimeout(() => {
        fetchUsers();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [userSearch, roleFilter, kycFilter]);

  // Refetch withdrawals on filter change
  useEffect(() => {
    if (activeTab === 'withdrawals') {
      fetchWithdrawals();
    }
  }, [wdStatusFilter]);

  // --- ACTIONS ---

  // Change Role
  const handleToggleUserRole = async (user: AdminUserRow) => {
    const targetRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Ubah role @${user.username} menjadi ${targetRole.toUpperCase()}?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ role: targetRole })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        fetchUsers();
        fetchStats();
        if (onRefreshCurrentUser && user.id === currentUser?.id) {
          onRefreshCurrentUser();
        }
      } else {
        showToast('error', data.error?.message || 'Gagal mengubah role');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Adjust Energy
  const handleAdjustEnergy = async () => {
    if (!selectedUserForAction) return;
    try {
      const res = await fetch(`/api/admin/users/${selectedUserForAction.id}/energy`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: energyAdjustAmount,
          reason: energyAdjustReason
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setIsAdjustEnergyModalOpen(false);
        fetchUsers();
        fetchStats();
      } else {
        showToast('error', data.error?.message || 'Gagal mengubah saldo');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Toggle Ban
  const handleToggleBan = async (user: AdminUserRow) => {
    const targetBanned = !user.isBanned;
    const actionText = targetBanned ? 'BEKUKAN (BANNED)' : 'AKTIFKAN KEMBALI';
    if (!confirm(`Apakah Anda yakin ingin ${actionText} akun @${user.username}?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}/ban`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isBanned: targetBanned })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        fetchUsers();
        fetchStats();
      } else {
        showToast('error', data.error?.message || 'Gagal mengubah status ban');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Toggle Verification
  const handleToggleVerify = async (user: AdminUserRow) => {
    const targetVerified = !user.isVerified;
    try {
      const res = await fetch(`/api/admin/users/${user.id}/verification`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          isVerified: targetVerified,
          kycStatus: targetVerified ? 'verified' : 'unverified'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        fetchUsers();
        fetchStats();
      } else {
        showToast('error', data.error?.message || 'Gagal mengubah verifikasi');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Apply Global Energy Discount
  const handleApplyGlobalDiscount = async () => {
    try {
      const res = await fetch('/api/admin/energy-packages/global-discount', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ discountPercent: globalDiscountInput })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        fetchEnergyPackages();
      } else {
        showToast('error', data.error?.message || 'Gagal menerapkan diskon');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Save Edit Energy Package
  const handleSaveEnergyPackage = async (pkg: EnergyPackageConfig) => {
    try {
      const res = await fetch(`/api/admin/energy-packages/${pkg.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(pkg)
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Paket Energy berhasil disimpan');
        setEditingEnergyPackage(null);
        fetchEnergyPackages();
      } else {
        showToast('error', data.error?.message || 'Gagal menyimpan');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Add Energy Package
  const handleAddEnergyPackage = async () => {
    if (!newEnergyPkg.energy || newEnergyPkg.energy <= 0) {
      showToast('error', 'Jumlah Energy harus lebih dari 0');
      return;
    }
    if (!newEnergyPkg.basePriceRp || newEnergyPkg.basePriceRp <= 0) {
      showToast('error', 'Harga dasar paket harus lebih dari 0');
      return;
    }

    try {
      const res = await fetch('/api/admin/energy-packages', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          energy: Number(newEnergyPkg.energy),
          basePriceRp: Number(newEnergyPkg.basePriceRp),
          discountPercent: Number(newEnergyPkg.discountPercent) || 0,
          label: newEnergyPkg.label || `${newEnergyPkg.energy} Energy`,
          bonus: newEnergyPkg.bonus || '',
          isPopular: Boolean(newEnergyPkg.isPopular),
          isActive: newEnergyPkg.isActive !== false
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `Paket ${newEnergyPkg.energy} Energy berhasil ditambahkan!`);
        setIsAddEnergyPackageOpen(false);
        fetchEnergyPackages();
      } else {
        showToast('error', data.error?.message || 'Gagal menambahkan');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Save Edit Premium Package
  const handleSavePremiumPackage = async (pkg: PremiumPackageConfig) => {
    try {
      const res = await fetch(`/api/admin/premium-packages/${pkg.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...pkg,
          priceEnergy: Number(pkg.priceEnergy),
          basePriceRp: Number(pkg.basePriceRp || (pkg.priceEnergy * 1000)),
          discountPercent: Number(pkg.discountPercent || 0),
          discountPriceRp: Number(pkg.priceEnergy * 1000),
          durationMonths: Number(pkg.durationMonths),
          maxGenerations: Number(pkg.maxGenerations || 2),
          totalCommissionPercent: Number(pkg.totalCommissionPercent || 20),
          energyBonus: Number(pkg.energyBonus || 0)
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Paket VIP Premium berhasil diperbarui');
        setEditingPremiumPackage(null);
        fetchPremiumPackages();
      } else {
        showToast('error', data.error?.message || 'Gagal memperbarui');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Add Premium Package
  const handleAddPremiumPackage = async () => {
    if (!newPremiumPkg.name.trim()) {
      showToast('error', 'Nama paket VIP harus diisi');
      return;
    }
    if (!newPremiumPkg.priceEnergy || newPremiumPkg.priceEnergy <= 0) {
      showToast('error', 'Harga Energy harus lebih dari 0');
      return;
    }

    try {
      const res = await fetch('/api/admin/premium-packages', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tier: newPremiumPkg.tier,
          name: newPremiumPkg.name,
          durationMonths: Number(newPremiumPkg.durationMonths),
          priceEnergy: Number(newPremiumPkg.priceEnergy),
          basePriceEnergy: Number(newPremiumPkg.basePriceEnergy || newPremiumPkg.priceEnergy),
          basePriceRp: Number(newPremiumPkg.basePriceRp || (newPremiumPkg.priceEnergy * 1000)),
          discountPercent: Number(newPremiumPkg.discountPercent || 0),
          discountPriceRp: Number(newPremiumPkg.priceEnergy * 1000),
          maxGenerations: Number(newPremiumPkg.maxGenerations || 2),
          totalCommissionPercent: Number(newPremiumPkg.totalCommissionPercent || 20),
          energyBonus: Number(newPremiumPkg.energyBonus || 0),
          features: newPremiumPkg.features,
          isPopular: Boolean(newPremiumPkg.isPopular),
          isActive: newPremiumPkg.isActive !== false
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `Paket VIP ${newPremiumPkg.name} berhasil ditambahkan!`);
        setIsAddPremiumPackageOpen(false);
        fetchPremiumPackages();
      } else {
        showToast('error', data.error?.message || 'Gagal menambahkan paket VIP');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Delete Premium Package
  const handleDeletePremiumPackage = async (id: string, name: string) => {
    if (!confirm(`Hapus paket VIP "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/premium-packages/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `Paket "${name}" berhasil dihapus.`);
        fetchPremiumPackages();
      } else {
        showToast('error', data.error?.message || 'Gagal menghapus paket');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Approve Withdrawal
  const handleApproveWithdrawal = async (wd: AdminWithdrawalRow) => {
    setIsApprovingWd(true);
    try {
      const finalDisbursementId = approveDisbursementId || `BFAST-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const finalNotes = approveNotes || `Disetujui & ditransfer via BI-FAST realtime oleh Admin (${currentUser?.username || 'Admin'})`;

      const res = await fetch(`/api/admin/withdrawals/${wd.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          disbursementId: finalDisbursementId,
          notes: finalNotes
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message || `Penarikan Rp ${wd.netAmountIdr.toLocaleString('id-ID')} berhasil dicairkan via BI-FAST!`);
        setSelectedWdForApprove(null);
        fetchWithdrawals();
        fetchStats();
      } else {
        showToast('error', data.error?.message || 'Gagal menyetujui penarikan');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsApprovingWd(false);
    }
  };

  // Reject Withdrawal
  const handleRejectWithdrawal = async () => {
    if (!selectedWdForReject) return;
    try {
      const res = await fetch(`/api/admin/withdrawals/${selectedWdForReject.id}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: rejectReason })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setSelectedWdForReject(null);
        fetchWithdrawals();
        fetchStats();
      } else {
        showToast('error', data.error?.message || 'Gagal menolak penarikan');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Send Broadcast
  const handleSendBroadcast = async () => {
    if (!broadcastTitle || !broadcastMessage) {
      showToast('error', 'Judul dan pesan siaran wajib diisi');
      return;
    }

    setIsSendingBroadcast(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: broadcastTitle,
          message: broadcastMessage,
          type: broadcastType
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setBroadcastTitle('');
        setBroadcastMessage('');
      } else {
        showToast('error', data.error?.message || 'Gagal mengirim siaran');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  // Quick Promote User by Username
  const handleQuickPromote = async () => {
    if (!quickPromoteUsername) return;
    try {
      const res = await fetch('/api/admin/promote-user', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          usernameOrId: quickPromoteUsername.trim(),
          role: quickPromoteRole,
          secretKey: 'scrolic-super-admin-2026'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.message);
        setQuickPromoteUsername('');
        fetchUsers();
        fetchStats();
      } else {
        showToast('error', data.error?.message || 'Gagal mengubah role');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // RBAC Access Guard
  const isAdmin = String(currentUser?.role || '').toLowerCase() === 'admin';

  if (!isAdmin) {
    return (
      <div className="w-full max-w-md mx-auto pb-28 px-4 text-center select-none pt-12">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-white font-display mb-2">Akses Terbatas: Admin Saja</h2>
        <p className="text-xs text-neutral-400 leading-relaxed max-w-xs mx-auto mb-6">
          Akun Anda (<strong className="text-white">@{currentUser?.username || 'user'}</strong>) memiliki role 
          <span className="px-2 py-0.5 ml-1 bg-neutral-800 text-amber-300 font-bold rounded-lg border border-neutral-700">USER</span>.
          Hanya role <strong>ADMIN</strong> yang dapat membuka panel kontrol ini.
        </p>

        {/* Quick Self Promote for Platform Owner */}
        <div className="bg-[#111111] border border-amber-500/30 rounded-2xl p-4 text-left space-y-3 mb-6">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
            <Sparkles className="w-4 h-4" />
            <span>Apakah Anda Pemilik Platform Scrolic?</span>
          </div>
          <p className="text-[11px] text-neutral-300">
            Jadikan akun <strong className="text-emerald-400">@{currentUser?.username}</strong> sebagai Admin sekarang untuk membuka akses panel:
          </p>
          <button
            onClick={async () => {
              if (!currentUser) return;
              try {
                const res = await fetch('/api/admin/promote-user', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    usernameOrId: currentUser.username,
                    role: 'admin',
                    secretKey: 'scrolic-super-admin-2026'
                  })
                });
                const data = await res.json();
                if (data.success) {
                  showToast('success', data.message);
                  if (onRefreshCurrentUser) onRefreshCurrentUser();
                  window.location.reload();
                } else {
                  showToast('error', data.error?.message || 'Gagal mempromosikan');
                }
              } catch (e: any) {
                showToast('error', e.message);
              }
            }}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Klaim Hak Akses Admin (@{currentUser?.username})</span>
          </button>
        </div>

        <button
          onClick={onBackToFeed}
          className="px-5 py-2.5 rounded-xl bg-[#141414] hover:bg-[#222222] border border-[#333333] text-neutral-300 text-xs font-semibold"
        >
          Kembali ke Feed
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto pb-28 px-3 sm:px-0 space-y-4 select-none">
      
      {/* Toast Notification */}
      {notificationMsg && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-2 border animate-in slide-in-from-top-4 duration-200 ${
          notificationMsg.type === 'success'
            ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50 shadow-emerald-950/50'
            : 'bg-rose-950 text-rose-300 border-rose-500/50 shadow-rose-950/50'
        }`}>
          {notificationMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
          <span>{notificationMsg.text}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="pt-2 pb-1 flex items-center justify-between">
        <button
          onClick={onBackToFeed}
          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer bg-[#0d2216] px-3 py-1.5 rounded-xl border border-emerald-500/20"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Admin Hub • @{currentUser.username}</span>
        </div>
      </div>

      {/* Hero Admin Title Banner */}
      <div className="relative rounded-3xl bg-gradient-to-br from-[#0c1c13] via-[#07130c] to-[#040a06] border border-emerald-500/40 p-4 overflow-hidden shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-black text-white font-display flex items-center gap-1.5">
              <span>Scrolic Admin Console</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500 text-black">RBAC v2.4</span>
            </h1>
            <p className="text-[11px] text-neutral-300">
              Kelola Pengguna, Diskon Energy, Paket Premium, dan Approval Pencairan.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Scrollable on mobile) */}
      <div className="flex overflow-x-auto no-scrollbar gap-1.5 p-1 bg-[#0c0c0c] border border-[#1f1f1f] rounded-2xl">
        {[
          { id: 'overview', label: 'Ringkasan', icon: TrendingUp },
          { id: 'users', label: 'Kelola User', icon: Users },
          { id: 'energy', label: 'Topup & Diskon', icon: Zap },
          { id: 'premium', label: 'Paket VIP', icon: Crown },
          { id: 'withdrawals', label: 'Pencairan', icon: ArrowUpRight, badge: stats?.withdrawals?.pendingCount },
          { id: 'broadcast', label: 'Broadcast', icon: Send },
          { id: 'guide', label: 'Panduan Admin', icon: HelpCircle }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab(tab.id as AdminTab);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#181818]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                  isActive ? 'bg-black text-amber-400' : 'bg-amber-500 text-black'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ==================================================== */}
      {/* TAB 1: OVERVIEW & STATS                              */}
      {/* ==================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-3.5 animate-in fade-in-50 duration-200">
          
          {/* Top Quick Metric Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Card 1: Users */}
            <div className="p-3.5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-1">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span>Total Pengguna</span>
                <Users className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-black text-white font-mono">
                {stats?.users?.total ?? '...'}
              </div>
              <div className="text-[10px] text-neutral-400 flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">{stats?.users?.admins ?? 0} Admin</span>
                <span>•</span>
                <span className="text-amber-400 font-bold">{stats?.users?.premium ?? 0} VIP</span>
              </div>
            </div>

            {/* Card 2: Energy */}
            <div className="p-3.5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-1">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span>Sirkulasi Energy</span>
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              </div>
              <div className="text-xl font-black text-amber-300 font-mono">
                {(stats?.energy?.totalInCirculation ?? 0).toLocaleString('id-ID')} ⚡
              </div>
              <div className="text-[10px] text-neutral-400">
                ≈ Rp {((stats?.energy?.totalInCirculation ?? 0) * 1000).toLocaleString('id-ID')}
              </div>
            </div>

            {/* Card 3: Pending Withdrawals */}
            <div className="p-3.5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-1">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span>Pencairan Pending</span>
                <Clock className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-xl font-black text-rose-400 font-mono">
                {stats?.withdrawals?.pendingCount ?? 0} Antrean
              </div>
              <div className="text-[10px] text-neutral-400 font-mono">
                Rp {(stats?.withdrawals?.pendingAmountIdr ?? 0).toLocaleString('id-ID')}
              </div>
            </div>

            {/* Card 4: Total Paid Out */}
            <div className="p-3.5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-1">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span>Total Komisi Cair</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-black text-emerald-400 font-mono">
                Rp {((stats?.withdrawals?.completedAmountIdr ?? 0) / 1000).toFixed(0)}k
              </div>
              <div className="text-[10px] text-neutral-400">
                {stats?.withdrawals?.completedCount ?? 0} Transaksi Sukses
              </div>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Aksi Cepat Admin</span>
            </h3>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveTab('users')}
                className="p-3 rounded-xl bg-[#181818] hover:bg-[#222222] border border-[#2a2a2a] text-left transition-colors cursor-pointer"
              >
                <Users className="w-4 h-4 text-emerald-400 mb-1" />
                <span className="font-bold text-white text-xs block">Kelola User</span>
                <span className="text-[10px] text-neutral-400">Ubah role & saldo</span>
              </button>

              <button
                onClick={() => setActiveTab('energy')}
                className="p-3 rounded-xl bg-[#181818] hover:bg-[#222222] border border-[#2a2a2a] text-left transition-colors cursor-pointer"
              >
                <Percent className="w-4 h-4 text-amber-400 mb-1" />
                <span className="font-bold text-white text-xs block">Flash Sale Diskon</span>
                <span className="text-[10px] text-neutral-400">Set diskon paket topup</span>
              </button>

              <button
                onClick={() => setActiveTab('withdrawals')}
                className="p-3 rounded-xl bg-[#181818] hover:bg-[#222222] border border-[#2a2a2a] text-left transition-colors cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4 text-rose-400 mb-1" />
                <span className="font-bold text-white text-xs block">Cairkan Komisi</span>
                <span className="text-[10px] text-neutral-400">{stats?.withdrawals?.pendingCount ?? 0} menunggu</span>
              </button>

              <button
                onClick={() => setActiveTab('broadcast')}
                className="p-3 rounded-xl bg-[#181818] hover:bg-[#222222] border border-[#2a2a2a] text-left transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4 text-sky-400 mb-1" />
                <span className="font-bold text-white text-xs block">Kirim Broadcast</span>
                <span className="text-[10px] text-neutral-400">Notifikasi ke semua user</span>
              </button>
            </div>
          </div>

          {/* Quick Promote Bar */}
          <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Promosikan User ke Admin Secara Cepat</span>
            </h3>
            <p className="text-[11px] text-neutral-400">
              Ketik username akun trader yang ingin Anda jadikan Administrator:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="cth: trader_pro atau username"
                value={quickPromoteUsername}
                onChange={(e) => setQuickPromoteUsername(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white text-xs placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleQuickPromote}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors cursor-pointer"
              >
                Jadikan Admin
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: USER MANAGEMENT                               */}
      {/* ==================================================== */}
      {activeTab === 'users' && (
        <div className="space-y-3.5 animate-in fade-in-50 duration-200">
          
          {/* Search & Filter Bar */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Cari username, nama, email, referral code..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white text-xs placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-xs text-neutral-300 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Role</option>
                <option value="admin">Admin Saja</option>
                <option value="user">User Biasa</option>
              </select>

              <select
                value={kycFilter}
                onChange={(e) => setKycFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-xs text-neutral-300 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Status KYC</option>
                <option value="verified">KYC Verified</option>
                <option value="unverified">Belum KYC</option>
                <option value="pending">KYC Pending</option>
              </select>

              <button
                onClick={fetchUsers}
                className="p-2 rounded-xl bg-[#161616] hover:bg-[#222222] border border-[#222222] text-neutral-300 transition-colors cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* User List */}
          <div className="space-y-2.5">
            <div className="text-[11px] text-neutral-400 flex justify-between items-center px-1">
              <span>Menampilkan <strong>{usersList.length}</strong> pengguna</span>
              <span className="text-emerald-400 font-bold font-mono">Realtime Live Sync</span>
            </div>

            {usersList.length === 0 ? (
              <div className="p-8 text-center bg-[#111111] rounded-2xl border border-[#1f1f1f] text-neutral-400 text-xs">
                Tidak ada pengguna yang cocok dengan filter pencarian.
              </div>
            ) : (
              usersList.map((u) => {
                const safeAvatarUrl = u.avatar && u.avatar.trim() !== '' 
                  ? u.avatar 
                  : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80';

                return (
                  <div
                    key={u.id}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      u.isBanned
                        ? 'bg-rose-950/20 border-rose-500/30'
                        : u.role === 'admin'
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : 'bg-[#111111] border-[#1f1f1f]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={safeAvatarUrl}
                          alt={u.username}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-white/10"
                        />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-white text-xs">{u.displayName}</h4>
                          {u.role === 'admin' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500 text-black">
                              ADMIN
                            </span>
                          )}
                          {u.isBanned && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500 text-white">
                              BANNED
                            </span>
                          )}
                          {u.subscriptionTier && u.subscriptionTier !== 'free' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              VIP
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-neutral-400 font-mono">@{u.username}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 text-amber-400 font-mono font-bold text-xs">
                        <Zap className="w-3 h-3 fill-amber-400" />
                        <span>{u.energyBalance} ⚡</span>
                      </div>
                      <span className="text-[10px] text-neutral-400 font-mono block">
                        Komisi: {u.affiliateEarningsEnergy}⚡
                      </span>
                    </div>
                  </div>

                  {/* Details strip */}
                  <div className="mt-2.5 pt-2 border-t border-white/5 grid grid-cols-3 gap-1 text-[10px] text-neutral-400 font-mono">
                    <div>
                      <span>KYC: </span>
                      <strong className={u.kycStatus === 'verified' ? 'text-emerald-400' : 'text-neutral-300'}>
                        {u.kycStatus === 'verified' ? 'Verified' : 'Belum'}
                      </strong>
                    </div>
                    <div>
                      <span>Win Rate: </span>
                      <strong className="text-white">{u.winRate}%</strong>
                    </div>
                    <div className="text-right">
                      <span>cTrader: </span>
                      <strong className={u.cTraderConnected ? 'text-emerald-400' : 'text-neutral-400'}>
                        {u.cTraderConnected ? 'Tersambung' : 'No'}
                      </strong>
                    </div>
                  </div>

                  {/* Admin Quick Control Buttons */}
                  <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap gap-1.5">
                    
                    {/* Toggle Role */}
                    <button
                      type="button"
                      onClick={() => handleToggleUserRole(u)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        u.role === 'admin'
                          ? 'bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-neutral-700'
                          : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {u.role === 'admin' ? 'Jadikan User Biasa' : 'Jadikan Admin'}
                    </button>

                    {/* Adjust Energy */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserForAction(u);
                        setEnergyAdjustAmount(50);
                        setIsAdjustEnergyModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3 fill-amber-400" />
                      <span>Ubah Saldo ⚡</span>
                    </button>

                    {/* Toggle Verify */}
                    <button
                      type="button"
                      onClick={() => handleToggleVerify(u)}
                      className="px-2 py-1 rounded-lg bg-[#181818] hover:bg-[#222222] text-neutral-300 border border-[#2a2a2a] text-[11px] transition-all cursor-pointer"
                    >
                      {u.isVerified ? 'Hapus Verified' : 'Beri Verified'}
                    </button>

                    {/* Toggle Ban */}
                    <button
                      type="button"
                      onClick={() => handleToggleBan(u)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        u.isBanned
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {u.isBanned ? 'Buka Ban' : 'Ban User'}
                    </button>

                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: ENERGY PACKAGES & DISCOUNT MANAGEMENT         */}
      {/* ==================================================== */}
      {activeTab === 'energy' && (
        <div className="space-y-4 animate-in fade-in-50 duration-200">
          
          {/* Global Flash Sale Banner & Form */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border border-amber-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">
                  Flash Sale Diskon Global
                </h3>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-500 text-white animate-pulse">
                PROMO LIVE
              </span>
            </div>

            <p className="text-[11px] text-neutral-300 leading-relaxed">
              Terapkan persentase diskon sekaligus ke seluruh paket top up Energy di aplikasi:
            </p>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={globalDiscountInput}
                  onChange={(e) => setGlobalDiscountInput(Math.max(0, Math.min(90, parseInt(e.target.value, 10) || 0)))}
                  className="w-full px-3 py-2 rounded-xl bg-[#141414] border border-[#2a2a2a] text-white text-xs font-mono font-bold focus:outline-none focus:border-amber-500 pl-3 pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold">%</span>
              </div>
              <button
                type="button"
                onClick={handleApplyGlobalDiscount}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all cursor-pointer shadow-lg shadow-amber-500/20"
              >
                Terapkan Diskon Global
              </button>
            </div>

            {/* Quick percent chips */}
            <div className="flex gap-1.5 pt-1">
              {[0, 10, 15, 20, 25, 30, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setGlobalDiscountInput(pct)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    globalDiscountInput === pct
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#181818] text-neutral-300 hover:bg-[#222222]'
                  }`}
                >
                  {pct === 0 ? 'Normal (0%)' : `${pct}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Package List Header */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <h3 className="font-bold text-white text-xs">Daftar Paket Top Up Energy</h3>
              <p className="text-[10px] text-neutral-400">Atur jumlah koin ⚡, harga normal, diskon, bonus koin, dan label paket</p>
            </div>
            <button
              onClick={() => {
                setNewEnergyPkg({
                  energy: 1000,
                  basePriceRp: 1000000,
                  discountPercent: 20,
                  label: 'Whale Trader 1000',
                  bonus: '+100 Bonus ⚡',
                  isPopular: true,
                  isActive: true
                });
                setIsAddEnergyPackageOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Buat Paket Baru</span>
            </button>
          </div>

          {/* Energy Packages Grid */}
          <div className="space-y-2.5">
            {energyPackages.length === 0 ? (
              <div className="p-8 text-center bg-[#111111] rounded-2xl border border-[#1f1f1f] text-neutral-400 text-xs">
                Belum ada paket top up. Klik "+ Buat Paket Baru" untuk menambahkan (contoh: 1000 Energy, 2500 Energy).
              </div>
            ) : (
              energyPackages.map((pkg) => {
                const effectivePrice = pkg.discountPriceRp || pkg.basePriceRp || (pkg.energy * 1000);
                const pricePerEnergy = Math.round(effectivePrice / (pkg.energy || 1));
                return (
                  <div
                    key={pkg.id}
                    className={`p-3.5 rounded-2xl bg-[#111111] border transition-all space-y-2.5 ${
                      pkg.isPopular
                        ? 'border-amber-500/40 shadow-sm shadow-amber-500/10'
                        : 'border-[#1f1f1f]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                          <Zap className="w-5 h-5 fill-amber-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-white text-sm font-mono">
                              {pkg.energy.toLocaleString('id-ID')} Energy ⚡
                            </h4>
                            <span className="text-[10px] text-neutral-400 font-normal font-sans">
                              ({pkg.label})
                            </span>
                            {pkg.isPopular && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500 text-black">
                                POPULER
                              </span>
                            )}
                            {pkg.discountPercent > 0 && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500 text-white">
                                -{pkg.discountPercent}% OFF
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] pt-0.5">
                            <span className="text-emerald-400 font-mono font-semibold">
                              {pkg.bonus || 'Tanpa Bonus Koin'}
                            </span>
                            <span className="text-neutral-500">•</span>
                            <span className="text-neutral-400 font-mono">
                              ~Rp {pricePerEnergy.toLocaleString('id-ID')}/⚡
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <span className="text-sm font-bold text-white block">
                          Rp {effectivePrice.toLocaleString('id-ID')}
                        </span>
                        {pkg.discountPercent > 0 && (
                          <span className="text-[10px] text-neutral-500 line-through block">
                            Rp {pkg.basePriceRp.toLocaleString('id-ID')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Edit, Clone, Toggle & Delete Action Buttons */}
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                      <span className={`text-[10px] font-bold ${pkg.isActive ? 'text-emerald-400' : 'text-neutral-500'}`}>
                        ● {pkg.isActive ? 'Tampil di Modal User' : 'Disembunyikan'}
                      </span>
                      <div className="flex gap-1.5">
                        {/* Clone Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setNewEnergyPkg({
                              energy: pkg.energy * 2 || 1000,
                              basePriceRp: pkg.basePriceRp * 2 || 1000000,
                              discountPercent: pkg.discountPercent || 20,
                              label: `${pkg.label} (Copy)`,
                              bonus: pkg.bonus || '+100 Bonus ⚡',
                              isPopular: false,
                              isActive: true
                            });
                            setIsAddEnergyPackageOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-[#181818] hover:bg-[#222222] text-neutral-300 border border-[#2c2c2c] text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                          title="Duplikat paket ini untuk membuat paket baru (misal 1000 Energy)"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Duplikat</span>
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => setEditingEnergyPackage(pkg)}
                          className="px-2.5 py-1 rounded-lg bg-[#1a1a1a] hover:bg-[#222222] text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Ubah Paket</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Hapus paket ${pkg.energy} Energy (${pkg.label})?`)) return;
                            await fetch(`/api/admin/energy-packages/${pkg.id}`, {
                              method: 'DELETE',
                              headers: getAuthHeaders()
                            });
                            showToast('success', 'Paket berhasil dihapus');
                            fetchEnergyPackages();
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[11px] cursor-pointer"
                          title="Hapus paket"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 4: PREMIUM PACKAGES MANAGEMENT                   */}
      {/* ==================================================== */}
      {activeTab === 'premium' && (
        <div className="space-y-4 animate-in fade-in-50 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111111] p-4 rounded-2xl border border-[#1f1f1f]">
            <div>
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Kelola Paket Langganan Premium VIP</h3>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Semua biaya paket menggunakan Energy (⚡). 1 Energy = Rp 1.000. Upgrade VIP membuka hak atur biaya setup & komisi multi-generasi (Gen 2-5).
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddPremiumPackageOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-md shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Paket VIP</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {premiumPackages.map((pkg) => {
              const currentPriceEnergy = pkg.priceEnergy || Math.round(pkg.discountPriceRp / 1000) || 99;
              const currentBaseEnergy = pkg.basePriceEnergy || Math.round((pkg.basePriceRp || (currentPriceEnergy * 1000)) / 1000);
              const maxGen = pkg.maxGenerations || (pkg.tier === 'premium_yearly' ? 5 : pkg.tier === 'premium_6m' ? 4 : pkg.tier === 'premium_3m' ? 3 : 2);
              const totalComm = pkg.totalCommissionPercent || (maxGen * 10);

              return (
                <div
                  key={pkg.id}
                  className="p-4 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between space-y-3 relative overflow-hidden"
                >
                  {pkg.isPopular && (
                    <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-amber-600 text-black font-black text-[9px] px-3 py-0.5 rounded-bl-xl uppercase tracking-wider">
                      Terpopuler
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          <Crown className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-white text-sm">{pkg.name}</h4>
                            {!pkg.isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400">Nonaktif</span>
                            )}
                          </div>
                          <span className="text-[11px] text-neutral-400 font-mono">
                            Durasi: {pkg.durationMonths} Bulan {pkg.energyBonus > 0 ? `• Bonus +${pkg.energyBonus}⚡` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <span className="text-base font-black text-amber-400 block">
                          {currentPriceEnergy} Energy ⚡
                        </span>
                        <span className="text-[10px] text-neutral-400 block">
                          Rp {(currentPriceEnergy * 1000).toLocaleString('id-ID')}
                        </span>
                        {pkg.discountPercent > 0 && (
                          <span className="text-[9px] text-neutral-500 line-through block">
                            {currentBaseEnergy}⚡ (Rp {(currentBaseEnergy * 1000).toLocaleString('id-ID')})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tier Benefits Summary Badges */}
                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="p-2 rounded-xl bg-[#161616] border border-[#262626]">
                        <span className="text-neutral-400 block">Akses Komisi Jaringan:</span>
                        <span className="font-bold text-emerald-400 font-mono">
                          Hingga Gen {maxGen} (Total {totalComm}%)
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-[#161616] border border-[#262626]">
                        <span className="text-neutral-400 block">Monetisasi Setup:</span>
                        <span className="font-bold text-amber-300">
                          Atur Biaya (1-10 ⚡)
                        </span>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="p-2.5 rounded-xl bg-[#151515] border border-[#222222] space-y-1">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                        Keuntungan VIP:
                      </span>
                      <div className="grid grid-cols-1 gap-1 text-[11px] text-neutral-300">
                        {(pkg.features || (pkg as any).benefits || []).map((f: string, i: number) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#1a1a1a]">
                    <span className="text-[10px] text-neutral-500 font-mono">Tier: {pkg.tier}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPremiumPackage(pkg)}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Ubah Paket</span>
                      </button>

                      {pkg.id.startsWith('prem-custom') && (
                        <button
                          type="button"
                          onClick={() => handleDeletePremiumPackage(pkg.id, pkg.name)}
                          className="px-2 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs cursor-pointer"
                          title="Hapus paket"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 5: WITHDRAWAL PROCESSING                         */}
      {/* ==================================================== */}
      {activeTab === 'withdrawals' && (
        <div className="space-y-3.5 animate-in fade-in-50 duration-200">
          
          {/* Filter Status Bar */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {['ALL', 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'].map((st) => (
              <button
                key={st}
                onClick={() => setWdStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  wdStatusFilter === st
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'bg-[#111111] text-neutral-400 hover:text-white border border-[#1f1f1f]'
                }`}
              >
                {st === 'ALL' ? 'Semua Status' : st}
              </button>
            ))}
          </div>

          {/* Withdrawals List */}
          <div className="space-y-3">
            {withdrawalsList.length === 0 ? (
              <div className="p-8 text-center bg-[#111111] rounded-2xl border border-[#1f1f1f] text-neutral-400 text-xs">
                Tidak ada data penarikan dengan status "{wdStatusFilter}".
              </div>
            ) : (
              withdrawalsList.map((wd) => (
                <div
                  key={wd.id}
                  className={`p-4 rounded-2xl border space-y-3 transition-all ${
                    wd.status === 'PENDING'
                      ? 'bg-[#141007] border-amber-500/40 shadow-lg shadow-amber-500/5'
                      : wd.status === 'SUCCESS'
                      ? 'bg-[#08150e] border-emerald-500/30'
                      : wd.status === 'FAILED'
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-[#111111] border-[#1f1f1f]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">@{wd.username}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          wd.status === 'PENDING'
                            ? 'bg-amber-500 text-black animate-pulse'
                            : wd.status === 'SUCCESS'
                            ? 'bg-emerald-500 text-black'
                            : wd.status === 'FAILED'
                            ? 'bg-rose-500 text-white'
                            : 'bg-neutral-800 text-neutral-300'
                        }`}>
                          {wd.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-400 font-mono block mt-0.5">
                        Ref: {wd.referenceId} • {new Date(wd.createdAt).toLocaleString('id-ID')}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-emerald-400 font-mono block">
                        Rp {wd.netAmountIdr.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[11px] text-amber-400 font-mono font-bold">
                        {wd.amountEnergy} Energy ⚡
                      </span>
                    </div>
                  </div>

                  {/* Bank Account Details */}
                  <div className="p-3 rounded-xl bg-[#0e0e0e] border border-[#222222] space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-neutral-400">
                      <span>Bank Tujuan:</span>
                      <span className="text-white font-bold">{wd.bankName} ({wd.bankCode})</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>Nomor Rekening:</span>
                      <span className="text-emerald-300 font-bold select-all">{wd.accountNumber}</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>Nama Pemilik Rekening:</span>
                      <span className="text-white font-bold">{wd.accountHolderName}</span>
                    </div>
                    {wd.disbursementId && (
                      <div className="flex justify-between text-neutral-400 pt-1 border-t border-white/5">
                        <span>No. BI-FAST Ref:</span>
                        <span className="text-sky-300 font-bold">{wd.disbursementId}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons for Admin */}
                  {wd.status === 'PENDING' && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          setSelectedWdForApprove(wd);
                          setApproveDisbursementId(`BFAST-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`);
                          setApproveNotes(`Disetujui & dicairkan via BI-FAST realtime`);
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Setujui & Transfer (BI-FAST)</span>
                      </button>

                      <button
                        onClick={() => {
                          setSelectedWdForReject(wd);
                          setRejectReason('Nomor rekening tidak valid atau nama tidak sesuai KYC');
                        }}
                        className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-[0.98] border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Tolak & Refund</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 6: BROADCAST ANNOUNCEMENT                        */}
      {/* ==================================================== */}
      {activeTab === 'broadcast' && (
        <div className="space-y-4 animate-in fade-in-50 duration-200">
          <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-3.5">
            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-4 h-4 text-sky-400" />
                <span>Kirim Siaran Pengumuman ke Semua User</span>
              </h3>
              <p className="text-[11px] text-neutral-400 mt-1">
                Pesan ini akan langsung muncul di tab Notifikasi setiap akun pengguna Scrolic.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Judul Pengumuman</label>
                <input
                  type="text"
                  placeholder="cth: Flash Sale 25% Diskon Energy Akhir Pekan! ⚡"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Isi Pesan Siaran</label>
                <textarea
                  rows={4}
                  placeholder="Tuliskan isi pengumuman atau instruksi untuk seluruh trader Scrolic..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-sky-500 text-xs"
                />
              </div>

              <button
                disabled={isSendingBroadcast}
                onClick={handleSendBroadcast}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-sky-500/20"
              >
                <Send className="w-4 h-4" />
                <span>{isSendingBroadcast ? 'Mengirim Siaran...' : 'Kirim Pengumuman Sekarang'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 7: ADMIN ROLE PROMOTION GUIDE                    */}
      {/* ==================================================== */}
      {activeTab === 'guide' && (
        <div className="space-y-4 animate-in fade-in-50 duration-200 text-xs text-neutral-300 leading-relaxed">
          
          <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>Cara Menjadikan User Sebagai Admin</span>
            </div>
            
            <p>
              Di platform Scrolic, sistem Role-Based Access Control (RBAC) membedakan antara 
              role <span className="text-amber-300 font-bold">user</span> dan role <span className="text-emerald-400 font-bold">admin</span>. 
              Terdapat 3 cara mudah untuk mengangkat akun menjadi Admin:
            </p>

            {/* Method 1: UI Button */}
            <div className="p-3 rounded-xl bg-[#161616] border border-[#222222] space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono text-[10px]">1</span>
                <span>Lewat Tab "Kelola User" di Dashboard ini</span>
              </h4>
              <p className="text-[11px] text-neutral-400">
                Buka tab <strong>Kelola User</strong>, cari akun pengguna yang diinginkan, lalu klik tombol 
                <span className="mx-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">Jadikan Admin</span>.
              </p>
            </div>

            {/* Method 2: API Request */}
            <div className="p-3 rounded-xl bg-[#161616] border border-[#222222] space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-mono text-[10px]">2</span>
                  <span>Lewat HTTP API Endpoint</span>
                </h4>
                <button
                  onClick={() => copyToClipboard(`curl -X POST http://localhost:3000/api/admin/promote-user -H "Content-Type: application/json" -d '{"usernameOrId": "USERNAME_ANDA", "role": "admin", "secretKey": "scrolic-super-admin-2026"}'`)}
                  className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode ? 'Disalin' : 'Salin cURL'}</span>
                </button>
              </div>
              
              <div className="bg-black/80 rounded-lg p-2.5 font-mono text-[10px] text-emerald-300 overflow-x-auto">
                POST /api/admin/promote-user<br />
                {JSON.stringify({ usernameOrId: "alex_trader", role: "admin", secretKey: "scrolic-super-admin-2026" }, null, 2)}
              </div>
            </div>

            {/* Method 3: MongoDB Shell Command */}
            <div className="p-3 rounded-xl bg-[#161616] border border-[#222222] space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-mono text-[10px]">3</span>
                  <span>Lewat Query Database MongoDB</span>
                </h4>
                <button
                  onClick={() => copyToClipboard(`db.users.updateOne({ username: "alex_trader" }, { $set: { role: "admin" } });`)}
                  className="text-[10px] text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>Salin Query</span>
                </button>
              </div>

              <div className="bg-black/80 rounded-lg p-2.5 font-mono text-[10px] text-sky-300 overflow-x-auto">
                db.users.updateOne(<br />
                &nbsp;&nbsp;&#123; username: "alex_trader" &#125;,<br />
                &nbsp;&nbsp;&#123; $set: &#123; role: "admin" &#125; &#125;<br />
                );
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADJUST USER ENERGY                            */}
      {/* ==================================================== */}
      {isAdjustEnergyModalOpen && selectedUserForAction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#222222] rounded-3xl w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>Ubah Saldo Energy @{selectedUserForAction.username}</span>
              </h3>
              <button
                onClick={() => setIsAdjustEnergyModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#161616] border border-[#222222] text-xs">
              <span className="text-neutral-400 block">Saldo saat ini:</span>
              <span className="text-xl font-bold font-mono text-amber-300">
                {selectedUserForAction.energyBalance} Energy ⚡
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">
                  Nominal Penyesuaian (+ untuk tambah, - untuk kurangi)
                </label>
                <input
                  type="number"
                  value={energyAdjustAmount}
                  onChange={(e) => setEnergyAdjustAmount(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Alasan / Catatan</label>
                <input
                  type="text"
                  value={energyAdjustReason}
                  onChange={(e) => setEnergyAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                onClick={handleAdjustEnergy}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-colors cursor-pointer"
              >
                Simpan & Update Saldo User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: EDIT ENERGY PACKAGE                           */}
      {/* ==================================================== */}
      {editingEnergyPackage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#222222] rounded-3xl w-full max-w-md p-5 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                  <Zap className="w-4 h-4 fill-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Ubah & Atur Paket Energy
                  </h3>
                  <p className="text-[10px] text-neutral-400">Sesuaikan jumlah energy, harga normal, diskon, dan bonus</p>
                </div>
              </div>
              <button
                onClick={() => setEditingEnergyPackage(null)}
                className="w-7 h-7 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Jumlah Energy Input & Preset Chips */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-neutral-300 font-bold flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Jumlah Energy (⚡)</span>
                  </label>
                  <span className="text-[10px] text-amber-400 font-mono font-bold">
                    {editingEnergyPackage.energy.toLocaleString('id-ID')} ⚡
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  value={editingEnergyPackage.energy}
                  onChange={(e) => {
                    const energyVal = parseInt(e.target.value, 10) || 0;
                    setEditingEnergyPackage({
                      ...editingEnergyPackage,
                      energy: energyVal
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
                />
                {/* Preset Chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
                  {[50, 100, 250, 500, 1000, 2500, 5000, 10000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setEditingEnergyPackage({
                          ...editingEnergyPackage,
                          energy: val,
                          basePriceRp: val * 1000,
                          label: val >= 5000 ? `Institutional ${val}` : val >= 1000 ? `Whale Trader ${val}` : val >= 250 ? `Trader Pro ${val}` : `Starter ${val}`
                        });
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                        editingEnergyPackage.energy === val
                          ? 'bg-amber-500 text-black font-bold'
                          : 'bg-[#181818] text-neutral-300 hover:bg-[#222222]'
                      }`}
                    >
                      {val >= 1000 ? `${val / 1000}k` : val} ⚡
                    </button>
                  ))}
                </div>
              </div>

              {/* Label / Nama Paket */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Nama / Label Paket</label>
                <input
                  type="text"
                  placeholder="Contoh: Whale Trader 1000"
                  value={editingEnergyPackage.label}
                  onChange={(e) => setEditingEnergyPackage({ ...editingEnergyPackage, label: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Harga Dasar & Diskon */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Harga Dasar (Rp)</label>
                  <input
                    type="number"
                    step="1000"
                    value={editingEnergyPackage.basePriceRp}
                    onChange={(e) => setEditingEnergyPackage({ ...editingEnergyPackage, basePriceRp: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                  {/* Quick Rate Calculators */}
                  <div className="flex gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingEnergyPackage({ ...editingEnergyPackage, basePriceRp: editingEnergyPackage.energy * 1000 })}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300 cursor-pointer"
                      title="1 Energy = Rp 1.000"
                    >
                      1k/⚡
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEnergyPackage({ ...editingEnergyPackage, basePriceRp: editingEnergyPackage.energy * 800 })}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300 cursor-pointer"
                      title="1 Energy = Rp 800"
                    >
                      800/⚡
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEnergyPackage({ ...editingEnergyPackage, basePriceRp: editingEnergyPackage.energy * 500 })}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300 cursor-pointer"
                      title="1 Energy = Rp 500"
                    >
                      500/⚡
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Diskon (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={editingEnergyPackage.discountPercent}
                    onChange={(e) => setEditingEnergyPackage({ ...editingEnergyPackage, discountPercent: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                  {/* Quick Discount Presets */}
                  <div className="flex gap-1 pt-1 flex-wrap">
                    {[0, 10, 15, 20, 25, 30, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setEditingEnergyPackage({ ...editingEnergyPackage, discountPercent: pct })}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer ${
                          editingEnergyPackage.discountPercent === pct
                            ? 'bg-rose-500 text-white font-bold'
                            : 'bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bonus Badge */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Bonus Koin Badge (Opsional)</label>
                <input
                  type="text"
                  placeholder="cth: +100 Bonus ⚡, Bonus VIP Signal"
                  value={editingEnergyPackage.bonus}
                  onChange={(e) => setEditingEnergyPackage({ ...editingEnergyPackage, bonus: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-amber-500"
                />
                <div className="flex gap-1 pt-1 flex-wrap">
                  {['+10 Bonus', '+50 Bonus ⚡', '+100 Bonus ⚡', '+500 Bonus ⚡', 'Best Value'].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setEditingEnergyPackage({ ...editingEnergyPackage, bonus: b })}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] hover:bg-[#252525] text-emerald-400 cursor-pointer"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles: isPopular & isActive */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="p-2.5 rounded-xl bg-[#161616] border border-[#222222] flex items-center justify-between cursor-pointer">
                  <span className="text-neutral-300 font-medium text-[11px]">Tandai Populer</span>
                  <input
                    type="checkbox"
                    checked={editingEnergyPackage.isPopular || false}
                    onChange={(e) => setEditingEnergyPackage({ ...editingEnergyPackage, isPopular: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 accent-amber-500"
                  />
                </label>
                <label className="p-2.5 rounded-xl bg-[#161616] border border-[#222222] flex items-center justify-between cursor-pointer">
                  <span className="text-neutral-300 font-medium text-[11px]">Tampil di User</span>
                  <input
                    type="checkbox"
                    checked={editingEnergyPackage.isActive !== false}
                    onChange={(e) => setEditingEnergyPackage({ ...editingEnergyPackage, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 accent-emerald-500"
                  />
                </label>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 rounded-2xl bg-[#161616] border border-amber-500/20 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-400">Harga Akhir Ditagihkan:</span>
                  <span className="font-bold text-amber-400 font-mono text-sm">
                    Rp {Math.round(editingEnergyPackage.basePriceRp * (1 - (editingEnergyPackage.discountPercent || 0) / 100)).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-neutral-400">
                  <span>Tarif per Energy:</span>
                  <span className="font-mono text-neutral-300">
                    Rp {Math.round((editingEnergyPackage.basePriceRp * (1 - (editingEnergyPackage.discountPercent || 0) / 100)) / (editingEnergyPackage.energy || 1)).toLocaleString('id-ID')}/⚡
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleSaveEnergyPackage(editingEnergyPackage)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-colors cursor-pointer shadow-md shadow-amber-500/20"
              >
                Simpan Perubahan Paket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADD NEW ENERGY PACKAGE                        */}
      {/* ==================================================== */}
      {isAddEnergyPackageOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#222222] rounded-3xl w-full max-w-md p-5 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Buat Paket Energy Baru</h3>
                  <p className="text-[10px] text-neutral-400">Tambahkan paket energy custom (contoh: 1.000 ⚡, 2.500 ⚡, 5.000 ⚡)</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddEnergyPackageOpen(false)}
                className="w-7 h-7 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Jumlah Energy Input & Preset Chips */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-neutral-300 font-bold flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Jumlah Energy (⚡)</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    {newEnergyPkg.energy.toLocaleString('id-ID')} ⚡
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  placeholder="Contoh: 1000"
                  value={newEnergyPkg.energy}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 0;
                    setNewEnergyPkg({
                      ...newEnergyPkg,
                      energy: val,
                      basePriceRp: val * 1000,
                      label: val >= 5000 ? `Institutional ${val}` : val >= 1000 ? `Whale Trader ${val}` : val >= 250 ? `Trader Pro ${val}` : `Starter ${val}`
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                />
                {/* Preset Chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
                  {[50, 100, 250, 500, 1000, 2500, 5000, 10000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setNewEnergyPkg({
                          ...newEnergyPkg,
                          energy: val,
                          basePriceRp: val * 1000,
                          label: val >= 5000 ? `Institutional ${val}` : val >= 1000 ? `Whale Trader ${val}` : val >= 250 ? `Trader Pro ${val}` : `Starter ${val}`,
                          bonus: val >= 2500 ? `+250 Bonus ⚡` : val >= 1000 ? `+100 Bonus ⚡` : val >= 500 ? `+50 Bonus ⚡` : `+10 Bonus`
                        });
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                        newEnergyPkg.energy === val
                          ? 'bg-emerald-500 text-black font-bold'
                          : 'bg-[#181818] text-neutral-300 hover:bg-[#222222]'
                      }`}
                    >
                      {val >= 1000 ? `${val / 1000}k` : val} ⚡
                    </button>
                  ))}
                </div>
              </div>

              {/* Label / Nama Paket */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Nama / Label Paket</label>
                <input
                  type="text"
                  placeholder="Contoh: Whale Trader 1000"
                  value={newEnergyPkg.label}
                  onChange={(e) => setNewEnergyPkg({ ...newEnergyPkg, label: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Harga Dasar & Diskon */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Harga Dasar (Rp)</label>
                  <input
                    type="number"
                    step="1000"
                    value={newEnergyPkg.basePriceRp}
                    onChange={(e) => setNewEnergyPkg({ ...newEnergyPkg, basePriceRp: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  {/* Quick Rate Calculators */}
                  <div className="flex gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewEnergyPkg({ ...newEnergyPkg, basePriceRp: newEnergyPkg.energy * 1000 })}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300 cursor-pointer"
                      title="1 Energy = Rp 1.000"
                    >
                      1k/⚡
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEnergyPkg({ ...newEnergyPkg, basePriceRp: newEnergyPkg.energy * 800 })}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300 cursor-pointer"
                      title="1 Energy = Rp 800"
                    >
                      800/⚡
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEnergyPkg({ ...newEnergyPkg, basePriceRp: newEnergyPkg.energy * 500 })}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300 cursor-pointer"
                      title="1 Energy = Rp 500"
                    >
                      500/⚡
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Diskon (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={newEnergyPkg.discountPercent}
                    onChange={(e) => setNewEnergyPkg({ ...newEnergyPkg, discountPercent: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  {/* Quick Discount Presets */}
                  <div className="flex gap-1 pt-1 flex-wrap">
                    {[0, 10, 15, 20, 25, 30, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setNewEnergyPkg({ ...newEnergyPkg, discountPercent: pct })}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer ${
                          newEnergyPkg.discountPercent === pct
                            ? 'bg-rose-500 text-white font-bold'
                            : 'bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bonus Badge */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Bonus Koin Badge (Opsional)</label>
                <input
                  type="text"
                  placeholder="cth: +100 Bonus ⚡, Bonus VIP Signal"
                  value={newEnergyPkg.bonus}
                  onChange={(e) => setNewEnergyPkg({ ...newEnergyPkg, bonus: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-1 pt-1 flex-wrap">
                  {['+10 Bonus', '+50 Bonus ⚡', '+100 Bonus ⚡', '+250 Bonus ⚡', '+500 Bonus ⚡', 'Best Value'].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setNewEnergyPkg({ ...newEnergyPkg, bonus: b })}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] hover:bg-[#252525] text-emerald-400 cursor-pointer"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles: isPopular & isActive */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="p-2.5 rounded-xl bg-[#161616] border border-[#222222] flex items-center justify-between cursor-pointer">
                  <span className="text-neutral-300 font-medium text-[11px]">Tandai Populer</span>
                  <input
                    type="checkbox"
                    checked={newEnergyPkg.isPopular}
                    onChange={(e) => setNewEnergyPkg({ ...newEnergyPkg, isPopular: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 accent-amber-500"
                  />
                </label>
                <label className="p-2.5 rounded-xl bg-[#161616] border border-[#222222] flex items-center justify-between cursor-pointer">
                  <span className="text-neutral-300 font-medium text-[11px]">Tampil di User</span>
                  <input
                    type="checkbox"
                    checked={newEnergyPkg.isActive}
                    onChange={(e) => setNewEnergyPkg({ ...newEnergyPkg, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 accent-emerald-500"
                  />
                </label>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 rounded-2xl bg-[#161616] border border-emerald-500/20 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-400">Harga Akhir Setelah Diskon:</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    Rp {Math.round(newEnergyPkg.basePriceRp * (1 - (newEnergyPkg.discountPercent || 0) / 100)).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-neutral-400">
                  <span>Tarif per Energy:</span>
                  <span className="font-mono text-neutral-300">
                    Rp {Math.round((newEnergyPkg.basePriceRp * (1 - (newEnergyPkg.discountPercent || 0) / 100)) / (newEnergyPkg.energy || 1)).toLocaleString('id-ID')}/⚡
                  </span>
                </div>
              </div>

              <button
                onClick={handleAddEnergyPackage}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition-colors cursor-pointer shadow-md shadow-emerald-500/20"
              >
                Tambahkan Paket ke Sistem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: EDIT PREMIUM PACKAGE                          */}
      {/* ==================================================== */}
      {editingPremiumPackage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#222222] rounded-3xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar animate-in zoom-in-95 duration-150 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-sm">
                  Edit Paket VIP: {editingPremiumPackage.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPremiumPackage(null)}
                className="w-7 h-7 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Nama & Tier */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Nama Paket VIP</label>
                  <input
                    type="text"
                    value={editingPremiumPackage.name}
                    onChange={(e) => setEditingPremiumPackage({ ...editingPremiumPackage, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Durasi (Bulan)</label>
                  <input
                    type="number"
                    min="1"
                    value={editingPremiumPackage.durationMonths}
                    onChange={(e) => setEditingPremiumPackage({ ...editingPremiumPackage, durationMonths: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Harga Energy & Diskon */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Harga Paket (Energy ⚡)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editingPremiumPackage.priceEnergy || Math.round(editingPremiumPackage.discountPriceRp / 1000) || 99}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      setEditingPremiumPackage({
                        ...editingPremiumPackage,
                        priceEnergy: val,
                        discountPriceRp: val * 1000,
                        basePriceRp: (editingPremiumPackage.basePriceEnergy || val) * 1000
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-amber-400 font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    = Rp {((editingPremiumPackage.priceEnergy || 99) * 1000).toLocaleString('id-ID')}
                  </span>
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Harga Dasar Energy (⚡)</label>
                  <input
                    type="number"
                    min="1"
                    value={editingPremiumPackage.basePriceEnergy || Math.round(editingPremiumPackage.basePriceRp / 1000) || (editingPremiumPackage.priceEnergy || 99)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      setEditingPremiumPackage({
                        ...editingPremiumPackage,
                        basePriceEnergy: val,
                        basePriceRp: val * 1000
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    = Rp {((editingPremiumPackage.basePriceEnergy || editingPremiumPackage.priceEnergy || 99) * 1000).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Multi-Generation Unlock & Bonus */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">
                    Akses Generasi Komisi
                  </label>
                  <select
                    value={editingPremiumPackage.maxGenerations || 2}
                    onChange={(e) => {
                      const gen = parseInt(e.target.value, 10) || 2;
                      setEditingPremiumPackage({
                        ...editingPremiumPackage,
                        maxGenerations: gen,
                        totalCommissionPercent: gen * 10
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="2">Hingga Generasi 2 (Total 20%)</option>
                    <option value="3">Hingga Generasi 3 (Total 30%)</option>
                    <option value="4">Hingga Generasi 4 (Total 40%)</option>
                    <option value="5">Hingga Generasi 5 (Total 50%)</option>
                  </select>
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Bonus Energy (⚡)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingPremiumPackage.energyBonus || 0}
                    onChange={(e) => setEditingPremiumPackage({ ...editingPremiumPackage, energyBonus: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Features Editor */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1.5">Daftar Keuntungan / Fitur:</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {editingPremiumPackage.features.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={feat}
                        onChange={(e) => {
                          const updated = [...editingPremiumPackage.features];
                          updated[idx] = e.target.value;
                          setEditingPremiumPackage({ ...editingPremiumPackage, features: updated });
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#161616] border border-[#2a2a2a] text-neutral-200 text-xs focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = editingPremiumPackage.features.filter((_, i) => i !== idx);
                          setEditingPremiumPackage({ ...editingPremiumPackage, features: updated });
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 cursor-pointer"
                        title="Hapus baris fitur"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingPremiumPackage({
                      ...editingPremiumPackage,
                      features: [...editingPremiumPackage.features, 'Keuntungan baru VIP']
                    });
                  }}
                  className="mt-2 text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Baris Keuntungan</span>
                </button>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="p-2.5 rounded-xl bg-[#161616] border border-[#222222] flex items-center justify-between cursor-pointer">
                  <span className="text-neutral-300 font-medium text-[11px]">Tandai Terpopuler</span>
                  <input
                    type="checkbox"
                    checked={editingPremiumPackage.isPopular}
                    onChange={(e) => setEditingPremiumPackage({ ...editingPremiumPackage, isPopular: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 accent-amber-500"
                  />
                </label>
                <label className="p-2.5 rounded-xl bg-[#161616] border border-[#222222] flex items-center justify-between cursor-pointer">
                  <span className="text-neutral-300 font-medium text-[11px]">Tampil di User</span>
                  <input
                    type="checkbox"
                    checked={editingPremiumPackage.isActive}
                    onChange={(e) => setEditingPremiumPackage({ ...editingPremiumPackage, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 accent-emerald-500"
                  />
                </label>
              </div>

              {/* Summary Box */}
              <div className="p-3 rounded-2xl bg-[#161616] border border-amber-500/20 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-400">Harga Akhir User:</span>
                  <span className="font-black text-amber-400 font-mono text-sm">
                    {editingPremiumPackage.priceEnergy || 99} Energy ⚡ (Rp {((editingPremiumPackage.priceEnergy || 99) * 1000).toLocaleString('id-ID')})
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-neutral-400">
                  <span>Akses Afiliasi:</span>
                  <span className="text-emerald-400 font-bold">
                    Generasi 1-{editingPremiumPackage.maxGenerations || 2} ({editingPremiumPackage.totalCommissionPercent || 20}% Komisi)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSavePremiumPackage(editingPremiumPackage)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-colors cursor-pointer shadow-md shadow-amber-500/20"
              >
                Simpan Perubahan Paket VIP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADD NEW PREMIUM PACKAGE                       */}
      {/* ==================================================== */}
      {isAddPremiumPackageOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-amber-500/30 rounded-3xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar animate-in zoom-in-95 duration-150 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-sm">
                  Tambah Paket VIP Baru
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPremiumPackageOpen(false)}
                className="w-7 h-7 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Nama & Durasi */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Nama Paket VIP</label>
                  <input
                    type="text"
                    placeholder="cth: Pro 3 Months Pass"
                    value={newPremiumPkg.name}
                    onChange={(e) => setNewPremiumPkg({ ...newPremiumPkg, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Durasi (Bulan)</label>
                  <input
                    type="number"
                    min="1"
                    value={newPremiumPkg.durationMonths}
                    onChange={(e) => setNewPremiumPkg({ ...newPremiumPkg, durationMonths: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Harga Energy & Tier */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Harga Paket (Energy ⚡)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newPremiumPkg.priceEnergy}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      setNewPremiumPkg({
                        ...newPremiumPkg,
                        priceEnergy: val,
                        basePriceEnergy: val,
                        basePriceRp: val * 1000
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-amber-400 font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    = Rp {(newPremiumPkg.priceEnergy * 1000).toLocaleString('id-ID')}
                  </span>
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Akses Generasi Komisi</label>
                  <select
                    value={newPremiumPkg.maxGenerations}
                    onChange={(e) => {
                      const gen = parseInt(e.target.value, 10) || 2;
                      setNewPremiumPkg({
                        ...newPremiumPkg,
                        maxGenerations: gen,
                        totalCommissionPercent: gen * 10
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="2">Hingga Generasi 2 (Total 20%)</option>
                    <option value="3">Hingga Generasi 3 (Total 30%)</option>
                    <option value="4">Hingga Generasi 4 (Total 40%)</option>
                    <option value="5">Hingga Generasi 5 (Total 50%)</option>
                  </select>
                </div>
              </div>

              {/* Bonus Energy */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Bonus Energy (⚡)</label>
                <input
                  type="number"
                  min="0"
                  value={newPremiumPkg.energyBonus}
                  onChange={(e) => setNewPremiumPkg({ ...newPremiumPkg, energyBonus: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Features List */}
              <div>
                <label className="text-neutral-300 font-semibold block mb-1.5">Fitur & Keuntungan VIP:</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {newPremiumPkg.features.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#161616] border border-[#2a2a2a] text-neutral-300 text-xs">
                        {feat}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = newPremiumPkg.features.filter((_, i) => i !== idx);
                          setNewPremiumPkg({ ...newPremiumPkg, features: updated });
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Tambah poin keuntungan baru..."
                    value={newPremiumPkg.newFeatureInput}
                    onChange={(e) => setNewPremiumPkg({ ...newPremiumPkg, newFeatureInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newPremiumPkg.newFeatureInput.trim()) {
                        e.preventDefault();
                        setNewPremiumPkg({
                          ...newPremiumPkg,
                          features: [...newPremiumPkg.features, newPremiumPkg.newFeatureInput.trim()],
                          newFeatureInput: ''
                        });
                      }
                    }}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#161616] border border-[#2a2a2a] text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newPremiumPkg.newFeatureInput.trim()) return;
                      setNewPremiumPkg({
                        ...newPremiumPkg,
                        features: [...newPremiumPkg.features, newPremiumPkg.newFeatureInput.trim()],
                        newFeatureInput: ''
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs cursor-pointer"
                  >
                    Tambah
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="p-2.5 rounded-xl bg-[#161616] border border-[#222222] flex items-center justify-between cursor-pointer">
                  <span className="text-neutral-300 font-medium text-[11px]">Tandai Terpopuler</span>
                  <input
                    type="checkbox"
                    checked={newPremiumPkg.isPopular}
                    onChange={(e) => setNewPremiumPkg({ ...newPremiumPkg, isPopular: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 accent-amber-500"
                  />
                </label>
                <label className="p-2.5 rounded-xl bg-[#161616] border border-[#222222] flex items-center justify-between cursor-pointer">
                  <span className="text-neutral-300 font-medium text-[11px]">Tampil di User</span>
                  <input
                    type="checkbox"
                    checked={newPremiumPkg.isActive}
                    onChange={(e) => setNewPremiumPkg({ ...newPremiumPkg, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 accent-emerald-500"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleAddPremiumPackage}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-colors cursor-pointer shadow-md shadow-amber-500/20"
              >
                Tambahkan Paket VIP ke Sistem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: APPROVE & TRANSFER BI-FAST                    */}
      {/* ==================================================== */}
      {selectedWdForApprove && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-emerald-500/40 rounded-3xl w-full max-w-md p-5 space-y-4 animate-in zoom-in-95 duration-150 shadow-2xl shadow-emerald-500/10">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Konfirmasi Transfer BI-FAST</span>
              </h3>
              <button
                disabled={isApprovingWd}
                onClick={() => setSelectedWdForApprove(null)}
                className="w-7 h-7 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Beneficiary & Amount Summary Box */}
            <div className="p-4 rounded-2xl bg-[#0a160e] border border-emerald-500/30 space-y-2.5">
              <div className="flex justify-between items-center pb-2 border-b border-emerald-500/20">
                <span className="text-xs text-neutral-300">Total Cair ke Rekening:</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  Rp {selectedWdForApprove.netAmountIdr.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Username Pemohon:</span>
                  <span className="text-white font-bold">@{selectedWdForApprove.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Bank Tujuan:</span>
                  <span className="text-white font-bold">{selectedWdForApprove.bankName} ({selectedWdForApprove.bankCode})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Nomor Rekening:</span>
                  <span className="text-emerald-300 font-mono font-bold select-all">{selectedWdForApprove.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Nama Penerima (KYC):</span>
                  <span className="text-white font-bold">{selectedWdForApprove.accountHolderName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Komisi Energy:</span>
                  <span className="text-amber-400 font-bold">{selectedWdForApprove.amountEnergy} Energy ⚡</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Ref Permintaan:</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{selectedWdForApprove.referenceId}</span>
                </div>
              </div>
            </div>

            {/* Inputs: BI-FAST Ref & Notes */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">
                  Nomor Referensi BI-FAST / Resi Transfer
                </label>
                <input
                  type="text"
                  value={approveDisbursementId}
                  onChange={(e) => setApproveDisbursementId(e.target.value)}
                  placeholder="cth: BFAST-1724301-9981"
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">
                  Catatan Admin (Tercatat di Mutasi & Notifikasi)
                </label>
                <input
                  type="text"
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="cth: Disetujui & dicairkan via BI-FAST realtime"
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  disabled={isApprovingWd}
                  onClick={() => setSelectedWdForApprove(null)}
                  className="flex-1 py-2.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] text-neutral-300 font-bold text-xs cursor-pointer transition-colors"
                >
                  Batal
                </button>

                <button
                  type="button"
                  disabled={isApprovingWd}
                  onClick={() => handleApproveWithdrawal(selectedWdForApprove)}
                  className="flex-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isApprovingWd ? 'Memproses Transfer...' : 'Konfirmasi Transfer & Setujui'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: REJECT WITHDRAWAL REASON                      */}
      {/* ==================================================== */}
      {selectedWdForReject && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-rose-500/30 rounded-3xl w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5 text-rose-400">
                <XCircle className="w-4 h-4" />
                <span>Tolak Penarikan & Refund Energy</span>
              </h3>
              <button
                onClick={() => setSelectedWdForReject(null)}
                className="w-7 h-7 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20 text-xs space-y-1">
              <span className="text-neutral-300 block">
                Pengembalian Dana Otomatis: <strong className="text-amber-400">+{selectedWdForReject.amountEnergy} Energy</strong>
              </span>
              <span className="text-neutral-400 block">
                Akan dikreditkan kembali ke akun @{selectedWdForReject.username}.
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Alasan Penolakan (Akan dikirim ke Notifikasi User)</label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#2a2a2a] text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <button
                onClick={handleRejectWithdrawal}
                className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Konfirmasi Tolak & Refund Saldo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
