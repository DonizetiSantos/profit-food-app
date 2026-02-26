
import React, { useState } from 'react';
import { User } from '../types';
import { supabase } from '../src/lib/supabase';

interface Props {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<Props> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) throw authError;

        if (data.user) {
          onLogin({
            id: data.user.id,
            name: data.user.user_metadata?.name || data.user.email || '',
            email: data.user.email || '',
          });
        }
      } else {
        if (!name || !email || !password) {
          setError('Preencha todos os campos.');
          setLoading(false);
          return;
        }

        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
            },
          },
        });

        if (authError) throw authError;

        if (data.user) {
          onLogin({
            id: data.user.id,
            name: data.user.user_metadata?.name || data.user.email || '',
            email: data.user.email || '',
          });
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Erro ao processar autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950 p-6 z-[100]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-500 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md animate-fade-in relative">
        <div className="text-center mb-10">
          <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full text-rose-500 fill-current drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]">
               <path d="M20,10 L70,10 C85,10 95,25 95,40 C95,55 85,70 70,70 L40,70 L40,95 L20,95 L20,10 Z M40,30 L40,50 L70,50 C75,50 80,45 80,40 C80,35 75,30 70,30 L40,30 Z" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter">PROFIT FOOD</h1>
          <p className="text-slate-500 font-medium uppercase tracking-[0.3em] text-[10px] mt-2">Inteligência Financeira</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl">
          <header className="flex mb-8 bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button 
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${isLogin ? 'bg-slate-800 text-rose-500 shadow-xl' : 'text-slate-500 hover:text-slate-400'}`}
            >
              Entrar
            </button>
            <button 
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${!isLogin ? 'bg-slate-800 text-rose-500 shadow-xl' : 'text-slate-500 hover:text-slate-400'}`}
            >
              Criar Conta
            </button>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            {!isLogin && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-bold text-sm"
                  placeholder="Seu nome"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail de Acesso</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-bold text-sm"
                placeholder="seu@email.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Senha</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-bold text-sm"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-xs font-bold text-center animate-shake">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className={`w-full py-5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl shadow-xl shadow-rose-950/20 transition-all active:scale-[0.98] uppercase tracking-widest text-sm ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? 'Processando...' : (isLogin ? 'Acessar Painel' : 'Finalizar Cadastro')}
            </button>
          </form>
        </div>
        
        <p className="mt-8 text-center text-slate-600 text-[9px] font-black uppercase tracking-[0.3em]">
          Plataforma de Gestão Gastronômica
        </p>
      </div>
      
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  );
};
