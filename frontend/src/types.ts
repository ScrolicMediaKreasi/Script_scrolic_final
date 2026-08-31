export type SubscriptionTier = 'free' | 'premium_monthly' | 'premium_3m' | 'premium_6m' | 'premium_yearly';

export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface BankAccount {
  id: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string; // Locked to KYC Full Name
  isPrimary?: boolean;
}

export interface Withdrawal {
  id: string;
  userId: string;
  amountEnergy: number;
  amountRp: number;
  feeRp: number;
  netAmountRp: number;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  referenceId: string;
  createdAt: string;
  completedAt?: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  role?: 'user' | 'admin';
  isBanned?: boolean;
  primaryStrategyId?: string;
  strategyDNA?: string;
  subscriptionTier: SubscriptionTier;
  isVerified: boolean;
  kycStatus?: KycStatus;
  kycFullName?: string;
  kycNik?: string;
  kycBirthDate?: string;
  kycAddress?: string;
  kycVerifiedAt?: string;
  bankAccounts?: BankAccount[];
  cTraderConnected: boolean;
  cTraderAccountId?: string;
  cTraderAccounts?: Array<{
    accountId: string;
    brokerName?: string;
    accountType?: 'DEMO' | 'LIVE';
    currency?: string;
    balance?: number;
    leverage?: number;
    isLive?: boolean;
    traderRegistrationTimestamp?: number;
  }>;
  cTraderBroker?: string;
  brokerName?: string;
  followersCount: number;
  followingCount: number;
  followingList?: string[];
  totalTrades?: number;
  totalTradesCount?: number;
  winRate: number;
  totalProfitUSD: number;
  totalPips: number;
  energyBalance: number;
  referralCode: string;
  referralsCount?: number;
  referredBy?: string;
  affiliateEarningsEnergy?: number;
  tradeEarningsEnergy?: number;
  defaultUnlockFee?: number;
  defaultFollowFee?: number;
  defaultUnlockPrice?: number;
  defaultFollowPrice?: number;
  createdAt: string;
}

export interface EnergyPackageConfig {
  id: string;
  energy: number;
  basePriceRp: number;
  discountPercent: number;
  discountPriceRp: number;
  label: string;
  bonus: string;
  isPopular?: boolean;
  isActive: boolean;
}

export interface PremiumPackageConfig {
  id: string;
  tier: 'premium_monthly' | 'premium_3m' | 'premium_6m' | 'premium_yearly';
  name: string;
  durationMonths: number;
  basePriceRp: number;
  discountPercent: number;
  discountPriceRp: number;
  energyBonus: number;
  features: string[];
  isActive: boolean;
  priceEnergy?: number;
  basePriceEnergy?: number;
  maxGenerations?: number;
  totalCommissionPercent?: number;
  isPopular?: boolean;
}

export type Notification = AppNotification;

export interface Strategy {
  id: string;
  name: string;
  tagline: string;
  description: string;
  accentColor: string; // e.g. #10B981, #F59E0B
  accentBg: string;
  accentBorder: string;
  badgeClass: string;
  gradient: string;
  positionBarGradient: string;
  fontVibe: string;
  icon: string;
  popularPairs: string[];
  riskStyle: string;
}

export type TradeDirection = 'BUY' | 'SELL';
export type TradeStatus = 'OPEN' | 'CLOSED';

export interface Trade {
  id: string;
  cTraderPositionId: string;
  userId: string;
  symbol: string;
  direction: TradeDirection;
  volumeLot: number;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  stopLoss: number;
  takeProfit: number;
  profitUSD: number;
  profitPercent: number;
  pips: number;
  openTime: string;
  closeTime?: string;
  duration: string;
  status: TradeStatus;
  strategyId: string;
  rrRatio?: string;
}

export interface FeedPost {
  id: string;
  tradeId: string;
  userId: string;
  user: User;
  trade: Trade;
  strategy: Strategy;
  autoDescription: string;
  customDescription?: string;
  descriptionUpdatedAt?: string;
  likesCount: number;
  commentsCount: number;
  savesCount: number;
  followersCount?: number;
  isLiked?: boolean;
  isSaved?: boolean;
  isUnlocked?: boolean;
  isFollowingSetup?: boolean;
  unlockFee?: number;
  followFee?: number;
  createdAt: string;
  updatedAt: string;
  rankingScore?: number;
}

export interface TradeUnlock {
  id: string;
  userId: string;
  postId: string;
  tradeId: string;
  costEnergy: number;
  unlockedAt: string;
}

export type EnergyTransactionType = 
  | 'TOPUP' 
  | 'UNLOCK'
  | 'UNLOCK_TRADE' 
  | 'FOLLOW_SETUP' 
  | 'UNLOCK_EARNING'
  | 'FOLLOW_EARNING'
  | 'ASK_AI' 
  | 'REFERRAL_COMMISSION' 
  | 'BONUS'
  | 'PREMIUM_UPGRADE'
  | 'COMMISSION_TRANSFER';

export interface EnergyTransaction {
  id: string;
  userId: string;
  amount: number; // positive or negative
  type: EnergyTransactionType;
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface ReferralCommission {
  id: string;
  receiverUserId: string;
  fromUserId: string;
  generation: 1 | 2 | 3 | 4 | 5;
  topupAmountRp: number;
  commissionPercentage: number;
  commissionEnergy: number;
  transactionId: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  user: {
    username: string;
    displayName: string;
    avatar: string;
    isVerified: boolean;
  };
  content: string;
  createdAt: string;
}

export type NotificationType = 
  | 'FOLLOW' 
  | 'TRADE_OPEN' 
  | 'TRADE_CLOSE' 
  | 'LIKE' 
  | 'COMMENT' 
  | 'ENERGY' 
  | 'SYSTEM';

export type NotificationCategory = 'all' | 'trading' | 'social' | 'system';

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId?: string;
  actor?: {
    username: string;
    displayName: string;
    avatar: string;
  };
  type: NotificationType;
  entityType?: 'post' | 'user' | 'wallet' | 'ctrader';
  entityId?: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface FollowOrderSafetyParams {
  postId: string;
  symbol: string;
  direction: TradeDirection;
  volumeLot: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rrRatio: '1:1' | '1:2' | '1:3' | '1:4' | '1:5';
  estimatedRiskUSD: number;
}

export type MayarPaymentStatus = 'UNPAID' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export interface MayarPaymentOrder {
  id: string;
  orderId: string;
  mayarPaymentId?: string;
  userId: string;
  amountEnergy: number;
  amountRp: number;
  paymentUrl: string;
  qrCode?: string;
  status: MayarPaymentStatus;
  paymentMethod?: string;
  createdAt: string;
  paidAt?: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerMobile?: string;
}

export interface MayarWebhookPayload {
  event: string;
  data: {
    id: string;
    transactionId?: string;
    amount: number;
    status: string;
    paymentMethod?: string;
    customerName?: string;
    customerEmail?: string;
    customerMobile?: string;
    extraData?: string;
    createdAt?: string;
    [key: string]: any;
  };
}

export type EconomicImpact = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface EconomicEvent {
  id: string;
  country: string;
  countryCode: string;
  flagEmoji: string;
  currency: string;
  title: string;
  date: string;
  time: string;
  datetime: string;
  impact: EconomicImpact;
  actual?: string | number | null;
  forecast?: string | number | null;
  previous?: string | number | null;
  unit?: string;
  affectedPairs: string[];
  description?: string;
  sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'PENDING';
  isReleased?: boolean;
}

export interface EconomicNewsArticle {
  id: string;
  title: string;
  source: string;
  date: string;
  timeAgo: string;
  url?: string;
  summary: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  affectedPairs: string[];
  tags: string[];
}
