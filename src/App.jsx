import { useState } from 'react';
import { Toaster } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import CyberneticGridShader from '@/components/ui/cybernetic-grid-shader';
import AuthPage from '@/components/tabs/AuthPage';
import AppShell from '@/components/layout/AppShell';
import ImageHideTab from '@/components/tabs/ImageHideTab';
import ImageRevealTab from '@/components/tabs/ImageRevealTab';
import AudioHideTab from '@/components/tabs/AudioHideTab';
import AudioRevealTab from '@/components/tabs/AudioRevealTab';
import ChatTab from '@/components/tabs/ChatTab';

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('image-hide');
  const [revealPreload, setRevealPreload] = useState(null);

  const handleDecryptImage = (url, name) => {
    setRevealPreload({ url, name });
    setActiveTab('image-reveal');
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'image-hide':   return <ImageHideTab />;
      case 'image-reveal': return <ImageRevealTab preload={revealPreload} onPreloadConsumed={() => setRevealPreload(null)} />;
      case 'audio-hide':   return <AudioHideTab />;
      case 'audio-reveal': return <AudioRevealTab />;
      case 'chat':         return <ChatTab onDecryptImage={handleDecryptImage} />;
      default:             return <ImageHideTab />;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <CyberneticGridShader />
        <p className="animate-pulse text-xs uppercase tracking-widest text-primary">Initializing…</p>
      </div>
    );
  }

  return (
    <>
      <CyberneticGridShader />
      <Toaster richColors theme="dark" position="bottom-right" />
      {user ? (
        <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
          {renderTab()}
        </AppShell>
      ) : (
        <AuthPage />
      )}
    </>
  );
}