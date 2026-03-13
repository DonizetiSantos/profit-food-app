import { supabase } from '../src/lib/supabase';
import { MainGroup } from '../types';
import { accountService } from './accountService';

export interface SettlementResult {
  status: 'LIQUIDADO' | 'PROVISIONADO';
  dueDate: string;
  liquidationDate: string | null;
  feePercent: number;
  feeFixed: number;
  feeAmount: number;
  netAmount: number;
  receivesSameDay: boolean;
  ruleFound: boolean;
}

export const settlementService = {
  async resolvePaymentSettlement(
    companyId: string,
    paymentMethodId: string | null,
    grossAmount: number,
    referenceDate: string
  ): Promise<SettlementResult> {
    const defaultResult: SettlementResult = {
      status: 'PROVISIONADO',
      dueDate: referenceDate,
      liquidationDate: null,
      feePercent: 0,
      feeFixed: 0,
      feeAmount: 0,
      netAmount: grossAmount,
      receivesSameDay: false,
      ruleFound: false
    };

    if (!paymentMethodId) return defaultResult;

    try {
      const { data: rule, error } = await supabase
        .from('payment_settlement_rules')
        .select('*')
        .eq('company_id', companyId)
        .eq('payment_method_id', paymentMethodId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('[SettlementService] Error fetching rule:', error);
        return defaultResult;
      }

      if (!rule) return defaultResult;

      const feePercent = rule.fee_percent || 0;
      const feeFixed = rule.fee_fixed || 0;
      const feeAmount = Number((grossAmount * (feePercent / 100) + feeFixed).toFixed(2));
      const netAmount = Number((grossAmount - feeAmount).toFixed(2));

      const settlementDays = rule.settlement_days || 0;
      const receivesSameDay = rule.receives_same_day || false;

      let status = rule.default_status || 'PROVISIONADO';
      let dueDate = referenceDate;
      let liquidationDate = null;

      if (receivesSameDay) {
        status = 'LIQUIDADO';
        dueDate = referenceDate;
        liquidationDate = referenceDate;
      } else {
        const date = new Date(referenceDate + 'T12:00:00');
        date.setDate(date.getDate() + settlementDays);
        dueDate = date.toISOString().split('T')[0];
        liquidationDate = status === 'LIQUIDADO' ? dueDate : null;
      }

      return {
        status,
        dueDate,
        liquidationDate,
        feePercent,
        feeFixed,
        feeAmount,
        netAmount,
        receivesSameDay,
        ruleFound: true
      };
    } catch (err) {
      console.error('[SettlementService] Unexpected error:', err);
      return defaultResult;
    }
  },

  async resolveCompanyFeeAccount(companyId: string): Promise<string | null> {
    const candidateNames = [
      'TAXAS CARTÕES',
      'TAXA CARTÃO',
      'TAXAS DE CARTÃO',
      'TAXAS FINANCEIRAS',
      'DESPESAS COM VENDAS',
      'DESPESAS VARIÁVEIS DE VENDAS',
      'TAXAS DE ANTECIPAÇÃO'
    ];

    try {
      // Try to find any of these accounts in the company
      const { data: existing, error } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('group_id', MainGroup.DESPESAS)
        .in('name', candidateNames.map(n => n.toUpperCase()));

      if (error) throw error;

      if (existing && existing.length > 0) {
        // Return the first match found based on our priority list
        for (const name of candidateNames) {
          const match = existing.find(e => e.name === name.toUpperCase());
          if (match) return match.id;
        }
      }

      // If not found, try to resolve/create 'TAXAS CARTÕES' as a safe fallback
      const fallbackId = await accountService.resolveAccountByName(
        companyId,
        'TAXAS CARTÕES',
        MainGroup.DESPESAS,
        { createIfMissing: true, defaultSubgroupId: 's-despesas-vendas' }
      );

      return fallbackId;
    } catch (err) {
      console.error('[SettlementService] Error resolving fee account:', err);
      return null;
    }
  },

  async resolveCompanyRevenueAccount(companyId: string): Promise<string | null> {
    try {
      const id = await accountService.resolveAccountByName(
        companyId,
        'VENDAS GERAIS',
        MainGroup.RECEITAS,
        { createIfMissing: true, defaultSubgroupId: 's-entradas-op' }
      );
      return id;
    } catch (err) {
      console.error('[SettlementService] Error resolving revenue account:', err);
      return null;
    }
  },

  async resolveReceiptAccountByPaymentMethod(companyId: string, paymentMethodId: string): Promise<string | null> {
    try {
      // 1. Get payment method to know its name/type
      const { data: method } = await supabase
        .from('payment_methods')
        .select('name')
        .eq('id', paymentMethodId)
        .maybeSingle();

      const methodName = method?.name?.toLowerCase() || '';
      let targetAccountName = '';

      if (methodName.includes('crédito') || methodName.includes('credito')) {
        targetAccountName = 'RECEBIMENTO CARTÃO CRÉDITO';
      } else if (methodName.includes('débito') || methodName.includes('debito')) {
        targetAccountName = 'RECEBIMENTO CARTÃO DÉBITO';
      } else if (methodName.includes('voucher') || methodName.includes('vale')) {
        targetAccountName = 'RECEBIMENTO VOUCHER';
      }

      if (!targetAccountName) return null;

      const id = await accountService.resolveAccountByName(
        companyId,
        targetAccountName,
        MainGroup.RECEITAS,
        { createIfMissing: true, defaultSubgroupId: 's-entradas-op' }
      );
      return id;
    } catch (err) {
      console.error('[SettlementService] Error resolving receipt account:', err);
      return null;
    }
  }
};
