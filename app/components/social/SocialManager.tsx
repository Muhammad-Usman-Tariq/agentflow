import { useState, useEffect, useRef } from 'react';

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', color: '#1877F2', icon: 'i-ph:facebook-logo-fill' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C', icon: 'i-ph:instagram-logo-fill' },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: 'i-ph:linkedin-logo-fill' },
  { id: 'twitter', label: 'X (Twitter)', color: '#000000', icon: 'i-ph:twitter-logo-fill' },
];

export default function SocialManager() {
  const [tab, setTab] = useState<'compose' | 'accounts' | 'history'>('compose');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [caption, setCaption] = useState('');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  // Image states
  const [includeImage, setIncludeImage] = useState(false);
  const [imageMode, setImageMode] = useState<'upload' | 'ai'>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [aiGeneratedImage, setAiGeneratedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Account credentials
  const [fbPageId, setFbPageId] = useState('');
  const [fbToken, setFbToken] = useState('');
  const [igAccountId, setIgAccountId] = useState('');
  const [igToken, setIgToken] = useState('');
  const [liToken, setLiToken] = useState('');
  const [liOrgId, setLiOrgId] = useState('');
  const [twApiKey, setTwApiKey] = useState('');
  const [twApiSecret, setTwApiSecret] = useState('');
  const [twAccessToken, setTwAccessToken] = useState('');
  const [twAccessSecret, setTwAccessSecret] = useState('');
  const [savingAccount, setSavingAccount] = useState('');

  useEffect(() => {
    fetch('/api/social')
      .then(r => r.json())
      .then((d: any) => setAccounts(d.accounts || []));
  }, []);

  const connectedPlatforms = accounts.filter(a => a.is_active).map(a => a.platform);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  // PC se image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage(reader.result as string);
      setAiGeneratedImage(null);
    };
    reader.readAsDataURL(file);
  };

  // AI se image generate
  const generateAiImage = async () => {
    if (!aiImagePrompt) return;
    setGeneratingImage(true);
    try {
      const res = await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_image', prompt: aiImagePrompt }),
      });
      const data = await res.json() as any;
      if (data.imageUrl) {
        setAiGeneratedImage(data.imageUrl);
        setUploadedImage(null);
      } else {
        alert('Image generation failed: ' + (data.error || 'Unknown error'));
      }
    } finally {
      setGeneratingImage(false);
    }
  };

  const currentImage = uploadedImage || aiGeneratedImage;

  // Caption generate
  const generateCaption = async () => {
    if (!topic) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_caption', topic, tone, platforms: selectedPlatforms }),
      });
      const data = await res.json() as any;
      if (data.caption) setCaption(data.caption);
    } finally {
      setGenerating(false);
    }
  };

  // Publish
  const publish = async () => {
    if (!caption || selectedPlatforms.length === 0) return;
    setPublishing(true);
    setResults([]);
    try {
      const res = await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish',
          caption,
          imageUrl: includeImage ? currentImage : undefined,
          platforms: selectedPlatforms,
        }),
      });
      const data = await res.json() as any;
      setResults(data.results || []);
    } finally {
      setPublishing(false);
    }
  };

  const saveAccount = async (platform: string, credentials: any, accountName: string) => {
    setSavingAccount(platform);
    try {
      await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_account', platform, accountName, credentials }),
      });
      const res = await fetch('/api/social');
      const data = await res.json() as any;
      setAccounts(data.accounts || []);
    } finally {
      setSavingAccount('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#ffffff] text-[#1f1b17]">

      {/* Tabs */}
      <div className="flex border-b border-[#e8e4df]">
        {(['compose', 'accounts', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-3 font-[#JetBrains_Mono,monospace] text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              tab === t
                ? 'border-b-2 border-[#a93011] text-[#a93011] bg-[#fbf2eb]/50'
                : 'text-[#5f5e5e] hover:text-[#1f1b17]'
            }`}
          >
            {t === 'compose' ? '✍️ Compose Post' : t === 'accounts' ? '🔗 Connected Accounts' : '📊 Post History'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── COMPOSE TAB ── */}
        {tab === 'compose' && (
          <>
            {/* Platform selector */}
            <div>
              <p className="font-[#JetBrains_Mono,monospace] text-[11px] font-semibold text-[#1f1b17] mb-2 uppercase tracking-wider">
                Select Platforms
              </p>
              <div className="flex gap-2.5 flex-wrap">
                {PLATFORMS.map(p => {
                  const isConnected = connectedPlatforms.includes(p.id);
                  const isSelected = selectedPlatforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => isConnected && togglePlatform(p.id)}
                      disabled={!isConnected}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] border transition-all ${
                        !isConnected
                          ? 'opacity-40 cursor-not-allowed border-[#e8e4df] text-[#9d9893]'
                          : isSelected
                          ? 'border-[#a93011] bg-[#cb4927] text-white font-medium shadow-sm'
                          : 'border-[#e8e4df] hover:border-[#a93011] text-[#1f1b17] bg-[#ffffff]'
                      }`}
                    >
                      <div className={`${p.icon} text-base`} />
                      <span>{p.label}</span>
                      {!isConnected && <span className="text-[10px] opacity-60">(not connected)</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI Caption Generator */}
            <div className="bg-[#fff8f4] rounded-xl p-5 border border-[#e8e4df]">
              <p className="font-semibold text-[#1f1b17] text-[14px] mb-3 flex items-center gap-2">
                <div className="i-ph:sparkle-fill text-[#a93011] text-base" />
                AI Caption Assistant
              </p>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Topic (e.g. New feature release v2.0, Summer Sale 50% off...)"
                className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2.5 text-[14px] mb-3 outline-none focus:border-[#a93011] focus:ring-1 focus:ring-[#a93011] transition-all"
              />
              <div className="flex gap-2">
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  className="bg-[#ffffff] border border-[#e8e4df] rounded-md px-3 py-2 text-[13px] outline-none text-[#1f1b17] focus:border-[#a93011]"
                >
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="funny">Funny</option>
                  <option value="inspiring">Inspiring</option>
                  <option value="promotional">Promotional</option>
                </select>
                <button
                  onClick={generateCaption}
                  disabled={generating || !topic}
                  className="flex-1 bg-[#a93011] hover:bg-[#ad3313] disabled:opacity-50 text-white rounded-md px-4 py-2 text-[13px] font-semibold tracking-wide transition-colors shadow-sm"
                >
                  {generating ? 'Generating Caption...' : 'Generate Caption'}
                </button>
              </div>
            </div>

            {/* Caption textarea */}
            <div>
              <p className="font-[#JetBrains_Mono,monospace] text-[11px] font-semibold text-[#1f1b17] mb-1.5 uppercase tracking-wider">
                Post Content
              </p>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Write your post content here or generate using AI..."
                rows={4}
                className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#a93011] focus:ring-1 focus:ring-[#a93011] transition-all resize-none"
              />
              <p className="font-[#JetBrains_Mono,monospace] text-[11px] text-[#9d9893] mt-1 text-right">{caption.length} chars</p>
            </div>

            {/* ── IMAGE SECTION ── */}
            <div className="bg-[#ffffff] rounded-xl border border-[#e8e4df] overflow-hidden">
              
              {/* Toggle header */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-[#f5f4f2]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#1f1b17] text-[14px]">Add Media Assets</span>
                  <span className="text-[12px] text-[#9d9893]">(optional)</span>
                </div>
                {/* Toggle switch */}
                <button
                  onClick={() => setIncludeImage(!includeImage)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    includeImage ? 'bg-[#a93011]' : 'bg-[#e8e4df]'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    includeImage ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Image options */}
              {includeImage && (
                <div className="p-5 border-t border-[#e8e4df] space-y-4">
                  
                  {/* Upload vs AI toggle */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setImageMode('upload')}
                      className={`flex-1 py-2 rounded-md text-[13px] font-semibold transition-colors border ${
                        imageMode === 'upload'
                          ? 'bg-[#a93011] border-[#a93011] text-white shadow-sm'
                          : 'border-[#e8e4df] text-[#5f5e5e] hover:text-[#1f1b17]'
                      }`}
                    >
                      Upload File
                    </button>
                    <button
                      onClick={() => setImageMode('ai')}
                      className={`flex-1 py-2 rounded-md text-[13px] font-semibold transition-colors border ${
                        imageMode === 'ai'
                          ? 'bg-[#a93011] border-[#a93011] text-white shadow-sm'
                          : 'border-[#e8e4df] text-[#5f5e5e] hover:text-[#1f1b17]'
                      }`}
                    >
                      Generate Image with AI
                    </button>
                  </div>

                  {/* Upload mode */}
                  {imageMode === 'upload' && (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-[#e8e4df] hover:border-[#a93011] rounded-xl py-6 text-center transition-colors group bg-[#faf9f7]"
                      >
                        <div className="i-ph:upload-simple text-2xl text-[#9d9893] group-hover:text-[#a93011] mx-auto mb-1" />
                        <p className="text-[13px] font-medium text-[#1f1b17]">
                          Click to upload image asset
                        </p>
                        <p className="text-[11px] text-[#9d9893] mt-0.5">PNG, JPG, WEBP formats supported</p>
                      </button>
                    </div>
                  )}

                  {/* AI generate mode */}
                  {imageMode === 'ai' && (
                    <div className="space-y-2">
                      <input
                        value={aiImagePrompt}
                        onChange={e => setAiImagePrompt(e.target.value)}
                        placeholder="Describe the image asset to generate..."
                        className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2.5 text-[14px] outline-none focus:border-[#a93011]"
                      />
                      <button
                        onClick={generateAiImage}
                        disabled={generatingImage || !aiImagePrompt}
                        className="w-full bg-[#1a1a1a] hover:bg-black disabled:opacity-50 text-white rounded-md py-2.5 text-[13px] font-semibold transition-colors shadow-sm"
                      >
                        {generatingImage ? 'Generating Image...' : 'Generate Image Asset'}
                      </button>
                    </div>
                  )}

                  {/* Image preview */}
                  {currentImage && (
                    <div className="mt-3 relative">
                      <img
                        src={currentImage}
                        alt="Post preview"
                        className="w-full rounded-xl max-h-48 object-cover border border-[#e8e4df]"
                      />
                      <button
                        onClick={() => { setUploadedImage(null); setAiGeneratedImage(null); }}
                        className="absolute top-2 right-2 bg-[#1f1b17]/80 hover:bg-[#1f1b17] text-white rounded-full w-7 h-7 flex items-center justify-center text-sm transition-colors"
                      >
                        ✕
                      </button>
                      <p className="text-[12px] text-[#006579] font-medium mt-1">
                        ✓ {uploadedImage ? 'Local image uploaded' : 'AI generated image ready'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Publish button */}
            <button
              onClick={publish}
              disabled={publishing || !caption || selectedPlatforms.length === 0}
              className="w-full bg-[#a93011] hover:bg-[#ad3313] disabled:opacity-50 text-white rounded-xl px-6 py-3 font-semibold text-[15px] transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <div className="i-ph:paper-plane-tilt text-lg" />
              {publishing
                ? 'Publishing Announcements...'
                : `Publish to ${selectedPlatforms.length} Platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
            </button>

            {/* Results */}
            {results.length > 0 && (
              <div className="bg-[#fff8f4] rounded-xl p-4 border border-[#e8e4df]">
                <p className="font-semibold text-[#1f1b17] text-[14px] mb-2">Publishing Status:</p>
                {results.map(r => (
                  <div key={r.platform} className={`flex items-center gap-2 py-1.5 text-[13px] ${r.success ? 'text-[#006579]' : 'text-[#ba1a1a]'}`}>
                    <span>{r.success ? '✓' : '✕'}</span>
                    <span className="capitalize font-semibold">{r.platform}</span>
                    <span className="text-[11px] opacity-80">{r.success ? `Post ID: ${r.postId}` : r.error}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ACCOUNTS TAB ── */}
        {tab === 'accounts' && (
          <div className="space-y-5">

            {/* Facebook */}
            <div className="bg-[#ffffff] rounded-xl p-5 border border-[#e8e4df] shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="i-ph:facebook-logo-fill text-2xl text-[#1877F2]" />
                <span className="font-semibold text-[#1f1b17] text-[16px]">Facebook Page</span>
                {connectedPlatforms.includes('facebook') && <span className="text-[11px] bg-[#fbf2eb] text-[#a93011] font-semibold px-2.5 py-0.5 rounded-full ml-auto">Connected</span>}
              </div>
              <input value={fbPageId} onChange={e => setFbPageId(e.target.value)} placeholder="Page ID" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-2.5 outline-none focus:border-[#a93011]" />
              <input value={fbToken} onChange={e => setFbToken(e.target.value)} placeholder="Page Access Token" type="password" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-3 outline-none focus:border-[#a93011]" />
              <button onClick={() => saveAccount('facebook', { pageId: fbPageId, pageAccessToken: fbToken }, 'My Page')} disabled={!fbPageId || !fbToken || savingAccount === 'facebook'} className="bg-[#1a1a1a] hover:bg-black disabled:opacity-50 text-white rounded-md px-4 py-2 text-[13px] font-semibold w-full transition-colors shadow-sm">
                {savingAccount === 'facebook' ? 'Saving...' : 'Save Facebook Account'}
              </button>
            </div>

            {/* Instagram */}
            <div className="bg-[#ffffff] rounded-xl p-5 border border-[#e8e4df] shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="i-ph:instagram-logo-fill text-2xl text-[#E1306C]" />
                <span className="font-semibold text-[#1f1b17] text-[16px]">Instagram Business</span>
                {connectedPlatforms.includes('instagram') && <span className="text-[11px] bg-[#fbf2eb] text-[#a93011] font-semibold px-2.5 py-0.5 rounded-full ml-auto">Connected</span>}
              </div>
              <input value={igAccountId} onChange={e => setIgAccountId(e.target.value)} placeholder="Business Account ID" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-2.5 outline-none focus:border-[#a93011]" />
              <input value={igToken} onChange={e => setIgToken(e.target.value)} placeholder="Access Token" type="password" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-3 outline-none focus:border-[#a93011]" />
              <button onClick={() => saveAccount('instagram', { businessAccountId: igAccountId, accessToken: igToken }, 'My Instagram')} disabled={!igAccountId || !igToken || savingAccount === 'instagram'} className="bg-[#1a1a1a] hover:bg-black disabled:opacity-50 text-white rounded-md px-4 py-2 text-[13px] font-semibold w-full transition-colors shadow-sm">
                {savingAccount === 'instagram' ? 'Saving...' : 'Save Instagram Account'}
              </button>
            </div>

            {/* LinkedIn */}
            <div className="bg-[#ffffff] rounded-xl p-5 border border-[#e8e4df] shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="i-ph:linkedin-logo-fill text-2xl text-[#0A66C2]" />
                <span className="font-semibold text-[#1f1b17] text-[16px]">LinkedIn Page</span>
                {connectedPlatforms.includes('linkedin') && <span className="text-[11px] bg-[#fbf2eb] text-[#a93011] font-semibold px-2.5 py-0.5 rounded-full ml-auto">Connected</span>}
              </div>
              <input value={liToken} onChange={e => setLiToken(e.target.value)} placeholder="Access Token" type="password" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-2.5 outline-none focus:border-[#a93011]" />
              <input value={liOrgId} onChange={e => setLiOrgId(e.target.value)} placeholder="Organization ID (optional)" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-3 outline-none focus:border-[#a93011]" />
              <button onClick={() => saveAccount('linkedin', { accessToken: liToken, organizationId: liOrgId || undefined }, 'My LinkedIn')} disabled={!liToken || savingAccount === 'linkedin'} className="bg-[#1a1a1a] hover:bg-black disabled:opacity-50 text-white rounded-md px-4 py-2 text-[13px] font-semibold w-full transition-colors shadow-sm">
                {savingAccount === 'linkedin' ? 'Saving...' : 'Save LinkedIn Account'}
              </button>
            </div>

            {/* Twitter/X */}
            <div className="bg-[#ffffff] rounded-xl p-5 border border-[#e8e4df] shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="i-ph:twitter-logo-fill text-2xl text-[#1f1b17]" />
                <span className="font-semibold text-[#1f1b17] text-[16px]">X (Twitter) Account</span>
                {connectedPlatforms.includes('twitter') && <span className="text-[11px] bg-[#fbf2eb] text-[#a93011] font-semibold px-2.5 py-0.5 rounded-full ml-auto">Connected</span>}
              </div>
              <input value={twApiKey} onChange={e => setTwApiKey(e.target.value)} placeholder="API Key" type="password" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-2 outline-none" />
              <input value={twApiSecret} onChange={e => setTwApiSecret(e.target.value)} placeholder="API Secret" type="password" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-2 outline-none" />
              <input value={twAccessToken} onChange={e => setTwAccessToken(e.target.value)} placeholder="Access Token" type="password" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-2 outline-none" />
              <input value={twAccessSecret} onChange={e => setTwAccessSecret(e.target.value)} placeholder="Access Token Secret" type="password" className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md px-3.5 py-2 text-[13px] mb-3 outline-none" />
              <button onClick={() => saveAccount('twitter', { apiKey: twApiKey, apiSecret: twApiSecret, accessToken: twAccessToken, accessTokenSecret: twAccessSecret }, 'My Twitter')} disabled={!twApiKey || savingAccount === 'twitter'} className="bg-[#1a1a1a] hover:bg-black disabled:opacity-50 text-white rounded-md px-4 py-2 text-[13px] font-semibold w-full transition-colors shadow-sm">
                {savingAccount === 'twitter' ? 'Saving...' : 'Save X (Twitter) Credentials'}
              </button>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div className="text-center text-[#9d9893] py-16">
            <div className="i-ph:clock-counter-clockwise text-4xl mb-3 text-[#5f5e5e] mx-auto" />
            <p className="font-semibold text-[#1f1b17] text-[16px]">Post Announcement History</p>
            <p className="text-[13px] text-[#5f5e5e] mt-1">Your social release announcements will be recorded here.</p>
          </div>
        )}
      </div>
    </div>
  );
}