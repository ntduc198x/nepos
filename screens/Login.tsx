import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ChefHat, User } from 'lucide-react';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const { t } = useTheme();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Handle Sign Up
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: 'staff' // Default role
            }
          }
        });

        if (error) throw error;
        
        alert("Account created successfully! Please sign in.");
        setIsSignUp(false);

      } else {
        // Handle Sign In
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        onLogin();
      }
    } catch (error: any) {
      console.error(error);
      if (error.message === 'Failed to fetch') {
        setErrorMsg('Connection failed. Please check your internet connection.');
      } else {
        setErrorMsg(error.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setErrorMsg('');
    setConfirmPassword('');
    setFullName('');
  };

  return (
    <div className="flex w-full h-screen bg-background text-text-main relative transition-colors">
      {/* Left Visual Side */}
      <div className="hidden lg:flex w-1/2 relative bg-[#1a2c26] items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=2070&auto=format&fit=crop"
            alt="Restaurant Interior" 
            className="w-full h-full object-cover opacity-40 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        </div>
        
        <div className="relative z-10 flex flex-col items-center text-center p-12 max-w-lg">
          <div className="size-20 rounded-2xl bg-primary flex items-center justify-center text-background mb-8 shadow-2xl shadow-primary/20">
            <ChefHat size={48} strokeWidth={2} />
          </div>
          <h1 className="text-4xl font-bold mb-4 text-white">{t('Nepos System')}</h1>
          <p className="text-lg text-gray-300 leading-relaxed">
            {t('LoginDescription')}
          </p>
        </div>
      </div>

      {/* Right Form Side */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left animate-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold tracking-tight text-text-main">
              {isSignUp ? t('Create an Account') : t('Welcome to Nepos')}
            </h2>
            <p className="text-secondary mt-2">
              {isSignUp ? t('Register text') : t('Login text')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {isSignUp && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-bold text-secondary ml-1">{t('Full Name')}</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors">
                      <User size={20} />
                    </div>
                    <input 
                      type="text" 
                      placeholder="John Doe"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full bg-surface border border-border rounded-xl py-3.5 pl-10 pr-4 text-text-main placeholder-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm"
                      required={isSignUp}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-bold text-secondary ml-1">{t('Email Address')}</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors">
                    <Mail size={20} />
                  </div>
                  <input 
                    type="email" 
                    placeholder="manager@nepos.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl py-3.5 pl-10 pr-4 text-text-main placeholder-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-secondary ml-1">{t('Password')}</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors">
                    <Lock size={20} />
                  </div>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl py-3.5 pl-10 pr-12 text-text-main placeholder-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-text-main transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {isSignUp && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-bold text-secondary ml-1">{t('Confirm Password')}</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-primary transition-colors">
                      <Lock size={20} />
                    </div>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-surface border border-border rounded-xl py-3.5 pl-10 pr-12 text-text-main placeholder-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm"
                      required={isSignUp}
                    />
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm font-bold text-center">
                    {errorMsg}
                </div>
            )}

            {!isSignUp && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-offset-background focus:ring-primary" />
                  <span className="text-secondary group-hover:text-text-main transition-colors">{t('Remember me')}</span>
                </label>
                <a href="#" className="font-bold text-primary hover:text-primary-hover hover:underline">{t('Forgot password?')}</a>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover text-background font-bold h-12 rounded-xl transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="size-5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
              ) : (
                <>
                  {isSignUp ? t('Create Account') : t('Sign In')} <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          <div className="text-center text-secondary text-sm">
            <p>
              {isSignUp ? t('Already have an account?') : t('Don\'t have an account?')}
              <button 
                onClick={toggleMode} 
                className="font-bold text-primary hover:underline ml-2"
              >
                {isSignUp ? t('Sign In') : t('Sign Up')}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};