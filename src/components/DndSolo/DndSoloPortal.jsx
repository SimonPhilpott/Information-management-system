import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dices, Sparkles, Shield, Swords, Scroll, BookOpen, Heart, Skull,
  RefreshCw, Send, Plus, Trash2, ChevronRight, Eye, Volume2, VolumeX,
  Award, Zap, HelpCircle, User, Compass, MapPin, CheckCircle2,
  FileText, Image as ImageIcon, Flame, ShieldAlert, ArrowLeft,
  Music, Radio, Sliders, ExternalLink, Download, BookMarked
} from 'lucide-react';
import ServicePage from '../Material/ServicePage';
import { Btn, FilterChip, IconButton, useSnack } from '../HomebrewBeta/ui';
import ChroniclerFace from '../Ims/ChroniclerFace';
import { dndAudio } from './dndAudioEngine';

// Free D&D & Tabletop Audio Repositories
const FREE_SOUND_REPOSITORIES = [
  {
    name: 'FreeSound.org',
    url: 'https://freesound.org',
    license: 'Creative Commons (CC0 & CC-BY)',
    desc: 'The largest open-source audio database in the world. Exceptional search tags for "dnd dice", "sword strike", "dungeon atmosphere", and "magic surge".',
    tags: ['Dice', 'Weapons', 'Dungeons', 'Monsters']
  },
  {
    name: 'Tabletop Audio',
    url: 'https://tabletopaudio.com',
    license: 'Free to Stream & Download (CC-BY-NC-ND)',
    desc: 'Tim Cross\'s acclaimed 10-minute seamless RPG soundscapes tailored specifically for tabletop sessions (Dungeon, Dark Fantasy, Spacecraft, Tavern).',
    tags: ['Seamless Ambience', 'Dungeons', 'Sci-Fi', 'Horror']
  },
  {
    name: 'Sonniss GDC Audio Archives',
    url: 'https://sonniss.com/gameaudioarchive',
    license: '100% Commercial Royalty-Free (No Attribution Needed)',
    desc: 'Huge annual game developer sound archives (tens of gigabytes) containing professional-grade medieval swords, armour, shields, bows, and dungeon reverb.',
    tags: ['High Definition', 'Medieval Combat', 'Creatures']
  },
  {
    name: 'OpenGameArt.org',
    url: 'https://opengameart.org',
    license: 'CC0 & Open Source',
    desc: 'Community-driven game audio. Great for discrete inventory clicks, potions quaffing, coin clinking, and classic RPG turn cues.',
    tags: ['Inventory', 'Magic SFX', 'Retro RPG']
  },
  {
    name: 'BBC Sound Effects Archive',
    url: 'https://sound-effects.bbcrewind.co.uk',
    license: 'Free for Personal & Non-Commercial Use',
    desc: 'Over 33,000 BBC historic recordings including medieval portcullis gates, castle dungeons, torrential rain, and thunder rumbles.',
    tags: ['Historic', 'Weather', 'Environments']
  },
  {
    name: 'Kenney.nl RPG & Medieval Audio',
    url: 'https://kenney.nl/assets/series:audio',
    license: 'Public Domain (CC0)',
    desc: 'Pristine, punchy UI, dice, footsteps, and medieval combat audio assets with zero copyright restrictions.',
    tags: ['UI', 'Combat', 'CC0 Public Domain']
  }
];

export default function DndSoloPortal({
  theme = 'dark',
  onThemeToggle,
  setCurrentPath
}) {
  const isDark = theme === 'dark';
  const snack = useSnack();

  // State
  const [activeTab, setActiveTab] = useState('chronicle'); // chronicle | character | dice | sourcebooks
  const [rulesets, setRulesets] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [processingTurn, setProcessingTurn] = useState(false);

  // Turn input
  const [playerInput, setPlayerInput] = useState('');
  const [attachedRoll, setAttachedRoll] = useState(null);
  const [attachedOracle, setAttachedOracle] = useState(null);

  // The Chronicler (LOTR LCG Integration)
  const [chroniclerEmotion, setChroniclerEmotion] = useState('neutral');
  const [chroniclerStatus, setChroniclerStatus] = useState('idle'); // idle | speaking | thinking
  const audioLevelRef = useRef({ current: 0 });
  const [showChronicleManuscript, setShowChronicleManuscript] = useState(false);

  // Ambient Soundscapes
  const [ambientAtmosphere, setAmbientAtmosphere] = useState('dungeon');
  const [isAmbiencePlaying, setIsAmbiencePlaying] = useState(false);
  const [ambientVolume, setAmbientVolume] = useState(0.35);
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  // Dice Tray
  const [diceType, setDiceType] = useState('d20');
  const [diceCount, setDiceCount] = useState(1);
  const [diceModifier, setDiceModifier] = useState(0);
  const [advantage, setAdvantage] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const [lastRoll, setLastRoll] = useState(null);
  const [isRolling, setIsRolling] = useState(false);

  // Solo Oracle
  const [oracleQuestion, setOracleQuestion] = useState('');
  const [oracleLikelihood, setOracleLikelihood] = useState('50/50');
  const [lastOracle, setLastOracle] = useState(null);

  // New Campaign Modal / Sheet
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRulesetId, setNewRulesetId] = useState('');
  const [newCharName, setNewCharName] = useState('');
  const [newPremise, setNewPremise] = useState('');

  // Asset viewer modal
  const [selectedAsset, setSelectedAsset] = useState(null);

  // Audio speech
  const [speakingTurnId, setSpeakingTurnId] = useState(null);

  const chronicleEndRef = useRef(null);

  const scrollToBottom = () => {
    chronicleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Initial Load
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Rulesets
      const resRules = await fetch('/api/dnd/rulesets');
      const dataRules = await resRules.json();
      if (dataRules.success) {
        setRulesets(dataRules.rulesets || []);
      }

      // Fetch Campaigns
      const resCamps = await fetch('/api/dnd/campaigns');
      const dataCamps = await resCamps.json();
      if (dataCamps.success && dataCamps.campaigns?.length > 0) {
        setCampaigns(dataCamps.campaigns);
        const targetId = activeCampaignId || dataCamps.campaigns[0].id;
        setActiveCampaignId(targetId);
      } else {
        setCampaigns([]);
        setActiveCampaign(null);
        setCharacter(null);
      }
    } catch (err) {
      console.error('Failed to load D&D data:', err);
      snack?.('Failed to load D&D data from server', { error: true });
    } finally {
      setLoading(false);
    }
  }, [activeCampaignId, snack]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      dndAudio.stopAmbience();
    };
  }, []);

  // 2. Fetch Active Campaign Details
  useEffect(() => {
    if (!activeCampaignId) return;
    const fetchCampaignDetail = async () => {
      try {
        const res = await fetch(`/api/dnd/campaigns/${activeCampaignId}`);
        const data = await res.json();
        if (data.success && data.campaign) {
          setActiveCampaign(data.campaign);

          // Auto-select fitting atmosphere based on genre
          const rulesetId = data.campaign.ruleset_id || '';
          if (rulesetId.includes('alien') || rulesetId.includes('across-a-thousand')) {
            setAmbientAtmosphere('scifi');
          } else if (rulesetId.includes('campfire')) {
            setAmbientAtmosphere('campfire');
          } else if (rulesetId.includes('doom') || rulesetId.includes('ker-nethalas')) {
            setAmbientAtmosphere('dungeon');
          }

          if (data.campaign.character_id) {
            const resChar = await fetch(`/api/dnd/characters/${data.campaign.character_id}`);
            const dataChar = await resChar.json();
            if (dataChar.success) {
              setCharacter(dataChar.character);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load campaign details:', err);
      }
    };
    fetchCampaignDetail();
  }, [activeCampaignId]);

  // Scroll chronicle when turns change
  useEffect(() => {
    if (activeTab === 'chronicle') {
      scrollToBottom();
    }
  }, [activeCampaign?.turns, activeTab]);

  // Handle ambient atmosphere toggle
  const toggleAmbience = () => {
    if (isAmbiencePlaying) {
      dndAudio.stopAmbience();
      setIsAmbiencePlaying(false);
    } else {
      dndAudio.startAmbience(ambientAtmosphere);
      setIsAmbiencePlaying(true);
    }
  };

  const changeAtmosphere = (type) => {
    setAmbientAtmosphere(type);
    if (isAmbiencePlaying) {
      dndAudio.startAmbience(type);
    }
  };

  // 3. Scan D&D Library Folder (G:\My Drive\BOOKS\D&D)
  const handleScanLibrary = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/dnd/scan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRulesets(data.rulesets || []);
        dndAudio.playSfx('spell_cast');
        snack?.(`Discovered ${data.count || 0} D&D & RPG rulesets in library!`);
      } else {
        throw new Error(data.error || 'Scan failed');
      }
    } catch (err) {
      console.error('Scan error:', err);
      snack?.(`Library scan failed: ${err.message}`, { error: true });
    } finally {
      setScanning(false);
    }
  };

  // 4. Submit Player Action (Turn Processing)
  const handleSubmitTurn = async (customPrompt) => {
    const actionText = customPrompt || playerInput;
    if (!actionText.trim() || !activeCampaignId) return;

    // Trigger action SFX contextually
    const lower = actionText.toLowerCase();
    if (lower.includes('attack') || lower.includes('strike') || lower.includes('sword') || lower.includes('blade')) {
      dndAudio.playSfx('sword_clash');
    } else if (lower.includes('defend') || lower.includes('shield') || lower.includes('block')) {
      dndAudio.playSfx('shield_block');
    } else if (lower.includes('cast') || lower.includes('spell') || lower.includes('magic')) {
      dndAudio.playSfx('spell_cast');
    } else if (lower.includes('door') || lower.includes('enter') || lower.includes('open')) {
      dndAudio.playSfx('door_creak');
    }

    setProcessingTurn(true);
    setChroniclerStatus('thinking');
    setChroniclerEmotion('neutral');

    try {
      const res = await fetch(`/api/dnd/campaigns/${activeCampaignId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerAction: actionText,
          diceRoll: attachedRoll,
          oracleResult: attachedOracle
        })
      });
      const data = await res.json();
      if (data.success && data.campaign) {
        setActiveCampaign(data.campaign);
        setPlayerInput('');
        setAttachedRoll(null);
        setAttachedOracle(null);

        // Adjust Chronicler expression based on latest turn drama
        const lastTurn = data.campaign.turns?.[data.campaign.turns.length - 1];
        if (lastTurn?.dice_roll?.isCrit) {
          setChroniclerEmotion('joy');
          dndAudio.playSfx('critical_hit');
        } else if (lastTurn?.dice_roll?.isFumble) {
          setChroniclerEmotion('fear');
          dndAudio.playSfx('fumble');
        } else if (lastTurn?.dm_narrative?.toLowerCase().includes('danger') || lastTurn?.dm_narrative?.toLowerCase().includes('blood')) {
          setChroniclerEmotion('rage');
        } else {
          setChroniclerEmotion('amazement');
        }

        snack?.('The Chronicler sets down the tale.');
      } else {
        throw new Error(data.error || 'Turn failed');
      }
    } catch (err) {
      console.error('Error submitting turn:', err);
      snack?.(`DM Error: ${err.message}`, { error: true });
    } finally {
      setProcessingTurn(false);
      setChroniclerStatus('idle');
    }
  };

  // 5. Roll Dice Engine
  const handleRollDice = async () => {
    setIsRolling(true);
    dndAudio.playSfx('dice_roll');

    try {
      const res = await fetch('/api/dnd/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diceType,
          count: diceCount,
          modifier: diceModifier,
          advantage,
          disadvantage
        })
      });
      const data = await res.json();
      if (data.success) {
        setLastRoll(data.result);
        if (data.result.isCrit) {
          setTimeout(() => dndAudio.playSfx('critical_hit'), 200);
          setChroniclerEmotion('joy');
        } else if (data.result.isFumble) {
          setTimeout(() => dndAudio.playSfx('fumble'), 200);
          setChroniclerEmotion('fear');
        }
        snack?.(`Rolled ${data.result.notation} ➔ ${data.result.total}`);
      }
    } catch (err) {
      console.error('Dice roll error:', err);
    } finally {
      setTimeout(() => setIsRolling(false), 300);
    }
  };

  // 6. Consult Solo Oracle
  const handleConsultOracle = async () => {
    if (!oracleQuestion.trim()) return;
    dndAudio.playSfx('oracle_whisper');

    try {
      const res = await fetch('/api/dnd/oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: oracleQuestion,
          likelihood: oracleLikelihood
        })
      });
      const data = await res.json();
      if (data.success) {
        setLastOracle(data.result);
        if (data.result.answer.includes('Yes')) {
          setChroniclerEmotion('joy');
        } else {
          setChroniclerEmotion('suspicious');
        }
        snack?.(`Oracle: ${data.result.answer}`);
      }
    } catch (err) {
      console.error('Oracle error:', err);
    }
  };

  // 7. Create New Campaign
  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newRulesetId) return;

    try {
      const selRule = rulesets.find((r) => r.id === newRulesetId);
      const defaultTemplate = selRule?.metadata?.character_template || {
        role_or_class: 'Adventurer',
        hp: 20, max_hp: 20, ac: 10,
        attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        inventory: ['Adventuring Pack', 'Rations', 'Torch', 'Coin Pouch (10 GP)'],
        skills: ['Survival', 'Investigation']
      };

      // 1. Create character
      const resChar = await fetch('/api/dnd/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleset_id: newRulesetId,
          name: newCharName.trim() || 'Hero of the Realm',
          role_or_class: defaultTemplate.role_or_class || 'Adventurer',
          level: 1,
          hp: defaultTemplate.hp || 20,
          max_hp: defaultTemplate.max_hp || 20,
          ac: defaultTemplate.ac || 10,
          attributes: defaultTemplate.attributes || {},
          inventory: defaultTemplate.inventory || [],
          skills: defaultTemplate.skills || [],
          backstory: newPremise || 'Embarked on a solitary quest into the unknown.'
        })
      });
      const dataChar = await resChar.json();
      if (!dataChar.success) throw new Error(dataChar.error || 'Failed to create character');

      // 2. Create campaign
      const resCamp = await fetch('/api/dnd/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          ruleset_id: newRulesetId,
          character_id: dataChar.character.id,
          setting_description: selRule?.name || 'Tabletop Solo Adventure',
          premise: newPremise.trim() || 'The adventure begins.'
        })
      });
      const dataCamp = await resCamp.json();
      if (!dataCamp.success) throw new Error(dataCamp.error || 'Failed to create campaign');

      setShowNewCampaign(false);
      setNewTitle('');
      setNewCharName('');
      setNewPremise('');
      await fetchAll();
      setActiveCampaignId(dataCamp.campaign.id);
      dndAudio.playSfx('spell_cast');
      snack?.(`Campaign "${dataCamp.campaign.title}" established!`);
    } catch (err) {
      console.error('Error creating campaign:', err);
      snack?.(`Failed to create campaign: ${err.message}`, { error: true });
    }
  };

  // 8. Update Character HP
  const handleModifyHp = async (delta) => {
    if (!character) return;
    const newHp = Math.max(0, Math.min(character.max_hp, character.hp + delta));
    if (delta < 0) {
      dndAudio.playSfx('shield_block');
      setChroniclerEmotion('fear');
    } else {
      dndAudio.playSfx('spell_cast');
      setChroniclerEmotion('joy');
    }

    try {
      const res = await fetch(`/api/dnd/characters/${character.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hp: newHp })
      });
      const data = await res.json();
      if (data.success) {
        setCharacter(data.character);
      }
    } catch (err) {
      console.error('Error modifying HP:', err);
    }
  };

  // 9. Read narrative with speech synthesis & animate ChroniclerFace
  const handleToggleSpeak = (turnId, text) => {
    if (!window.speechSynthesis) return;

    if (speakingTurnId === turnId) {
      window.speechSynthesis.cancel();
      setSpeakingTurnId(null);
      setChroniclerStatus('idle');
      audioLevelRef.current = 0;
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 1.0;
    utterance.pitch = 0.92;

    setChroniclerStatus('speaking');
    audioLevelRef.current = 0.65;

    // Simulate animated speech level pulses for Chronicler lip-sync
    const pulseInterval = setInterval(() => {
      audioLevelRef.current = 0.2 + Math.random() * 0.7;
    }, 120);

    utterance.onend = () => {
      clearInterval(pulseInterval);
      setSpeakingTurnId(null);
      setChroniclerStatus('idle');
      audioLevelRef.current = 0;
    };
    utterance.onerror = () => {
      clearInterval(pulseInterval);
      setSpeakingTurnId(null);
      setChroniclerStatus('idle');
      audioLevelRef.current = 0;
    };

    setSpeakingTurnId(turnId);
    window.speechSynthesis.speak(utterance);
  };

  const currentRuleset = rulesets.find((r) => r.id === activeCampaign?.ruleset_id);

  return (
    <ServicePage
      rail="dash"
      title="D&D Solo DM"
      icon="dice"
      accent="orange"
      wide
      theme={theme}
      onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath}
      backTo="/ims"
      backLabel="Back to IMS Hub"
      sub="Autonomous Tabletop RPG Dungeon Master with dynamic rulebooks, 3D dice rolling, character sheets, and solo oracle."
    >
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Top Control Bar */}
        <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 backdrop-blur-xl ${
          isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white/80 border-[#2E2B27]/10'
        }`}>
          {/* Campaign Selector & Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Scroll size={18} className="text-amber-500 shrink-0" />
              <select
                value={activeCampaignId || ''}
                onChange={(e) => setActiveCampaignId(e.target.value)}
                className={`text-xs font-bold rounded-xl px-3 py-2 border outline-none cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 text-slate-200 border-white/10 hover:border-amber-500/50'
                    : 'bg-amber-50/50 text-slate-800 border-[#2E2B27]/20 hover:border-amber-600'
                }`}
              >
                {campaigns.length === 0 && <option value="">No Campaigns Active</option>}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.ruleset_id})
                  </option>
                ))}
              </select>
            </div>

            <Btn
              variant="tonal"
              onClick={() => {
                if (rulesets.length > 0) setNewRulesetId(rulesets[0].id);
                setShowNewCampaign(true);
              }}
              className="text-xs"
            >
              <Plus size={14} className="mr-1" /> New Campaign
            </Btn>

            <Btn
              variant="tonal"
              onClick={handleScanLibrary}
              disabled={scanning}
              className="text-xs"
              title="Scan G:\My Drive\BOOKS\D&D for sourcebooks, maps and rule sets"
            >
              <RefreshCw size={14} className={`mr-1 ${scanning ? 'animate-spin text-amber-500' : ''}`} />
              {scanning ? 'Scanning...' : 'Scan D&D Books'}
            </Btn>

            {/* Chronicle Manuscript View Button */}
            {activeCampaign && (
              <Btn
                variant="tonal"
                onClick={() => setShowChronicleManuscript(true)}
                className="text-xs"
                title="View the illuminated Chronicle Manuscript of this campaign"
              >
                <BookMarked size={14} className="mr-1 text-amber-400" /> Chronicle Book
              </Btn>
            )}
          </div>

          {/* Quick Hero Banner */}
          {character && (
            <div className={`flex items-center gap-4 px-3.5 py-1.5 rounded-xl border text-xs font-mono ${
              isDark ? 'bg-slate-800/80 border-white/5' : 'bg-amber-50 border-amber-200/50 text-slate-800'
            }`}>
              <div className="flex items-center gap-1.5">
                <User size={14} className="text-amber-500" />
                <span className="font-bold">{character.name}</span>
                <span className="opacity-60 text-[10px]">({character.role_or_class})</span>
              </div>
              <div className="h-3 w-px bg-slate-500/30" />
              <div className="flex items-center gap-1.5">
                <Heart size={14} className="text-rose-500 fill-rose-500" />
                <span className="font-bold">{character.hp} / {character.max_hp} HP</span>
              </div>
              <div className="h-3 w-px bg-slate-500/30" />
              <div className="flex items-center gap-1.5">
                <Shield size={14} className="text-sky-500" />
                <span className="font-bold">AC {character.ac}</span>
              </div>
            </div>
          )}
        </div>

        {/* Ambient Soundscapes & SFX Toolbar */}
        <div className={`px-4 py-2.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs font-mono backdrop-blur-md ${
          isDark ? 'bg-slate-900/40 border-white/5' : 'bg-amber-50/60 border-amber-200/40'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAmbience}
              className={`p-2 rounded-xl flex items-center gap-1.5 font-bold transition-all ${
                isAmbiencePlaying
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                  : isDark ? 'bg-white/5 hover:bg-white/10 text-slate-400' : 'bg-black/5 hover:bg-black/10 text-slate-700'
              }`}
              title={isAmbiencePlaying ? 'Pause soundscape' : 'Play ambient atmosphere'}
            >
              <Music size={14} className={isAmbiencePlaying ? 'animate-pulse' : ''} />
              <span>{isAmbiencePlaying ? 'Soundscape Active' : 'Start Ambience'}</span>
            </button>

            {/* Atmosphere Presets */}
            <div className="flex items-center gap-1">
              {[
                { id: 'dungeon', label: 'Dungeon', icon: Skull },
                { id: 'campfire', label: 'Campfire', icon: Flame },
                { id: 'tavern', label: 'Tavern', icon: Heart },
                { id: 'scifi', label: 'Derelict Hulk', icon: Zap },
                { id: 'storm', label: 'Storm Ruins', icon: Radio }
              ].map((atm) => {
                const isSelected = ambientAtmosphere === atm.id;
                return (
                  <button
                    key={atm.id}
                    onClick={() => changeAtmosphere(atm.id)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] transition-all flex items-center gap-1 ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                        : isDark
                          ? 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                          : 'bg-transparent border-transparent text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    <atm.icon size={11} />
                    <span>{atm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Volume & Quick SFX Buttons */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 opacity-80">
              <span className="text-[10px] uppercase text-slate-400">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={ambientVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setAmbientVolume(val);
                  dndAudio.setAmbientVolume(val);
                }}
                className="w-16 accent-amber-500 cursor-pointer"
                title={`Ambient Volume: ${Math.round(ambientVolume * 100)}%`}
              />
            </div>

            <button
              onClick={() => {
                const muted = dndAudio.toggleMute();
                setIsAudioMuted(muted);
              }}
              className={`p-1.5 rounded-lg border text-xs ${
                isAudioMuted
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : isDark ? 'border-white/5 text-slate-400 hover:text-white' : 'border-black/5 text-slate-600'
              }`}
              title={isAudioMuted ? 'Unmute Audio' : 'Mute All Sound'}
            >
              {isAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 gap-2 pb-2">
          {[
            { id: 'chronicle', label: 'Chronicle & DM', icon: Flame },
            { id: 'character', label: 'Hero Sheet', icon: Shield },
            { id: 'dice', label: 'Dice Tray & Oracle', icon: Dices },
            { id: 'sourcebooks', label: 'Rulebooks & Free Audio', icon: BookOpen }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.35)]'
                    : isDark
                      ? 'text-slate-400 hover:text-white hover:bg-white/5'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-black/5'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Empty State Onboarding */}
        {campaigns.length === 0 && !loading && (
          <div className={`p-10 rounded-3xl border text-center flex flex-col items-center justify-center gap-4 ${
            isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white border-[#2E2B27]/15'
          }`}>
            <div className="p-4 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-red-500/20 border border-amber-500/30 text-amber-500">
              <Dices size={40} />
            </div>
            <h2 className="text-xl font-black tracking-tight">Your Solo Tabletop Awaits</h2>
            <p className={`text-xs max-w-lg leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              IMS can run completely autonomous solo campaigns across 9+ tabletop RPG systems including <b>D&D 5th Edition</b>, <b>Across a Thousand Dead Worlds</b>, <b>Alien RPG</b>, <b>Ker Nethalas</b>, and <b>Barbarian Prince</b>.
            </p>
            <div className="flex gap-3 mt-2">
              <Btn
                variant="filled"
                onClick={() => {
                  if (rulesets.length > 0) setNewRulesetId(rulesets[0].id);
                  setShowNewCampaign(true);
                }}
              >
                <Plus size={16} className="mr-1.5" /> Start New Adventure
              </Btn>
              <Btn variant="tonal" onClick={handleScanLibrary}>
                <RefreshCw size={16} className="mr-1.5" /> Scan Books Directory
              </Btn>
            </div>
          </div>
        )}

        {/* TAB 1: CHRONICLE & DUNGEON MASTER */}
        {activeTab === 'chronicle' && activeCampaign && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Story Narrative (3 cols) */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className={`rounded-3xl border p-6 flex flex-col gap-6 min-h-[500px] max-h-[680px] overflow-y-auto ${
                isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-[#2E2B27]/10'
              }`}>
                {/* Opening Campaign Premise */}
                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-amber-950/20 border-amber-500/20 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}>
                  <div className="flex items-center gap-2 mb-1.5 font-bold text-xs uppercase tracking-wider text-amber-500">
                    <Compass size={14} /> Campaign Setting & Premise
                  </div>
                  <h3 className="text-base font-black tracking-tight mb-1">{activeCampaign.title}</h3>
                  <p className="text-xs leading-relaxed opacity-90">{activeCampaign.premise || activeCampaign.setting_description}</p>
                </div>

                {/* Turns Chronicle Stream */}
                {activeCampaign.turns?.map((turn, idx) => {
                  const isSpeaking = speakingTurnId === turn.id;
                  return (
                    <div key={turn.id || idx} className="flex flex-col gap-3">
                      {/* Player Action */}
                      <div className="flex justify-end">
                        <div className={`max-w-[85%] p-4 rounded-2xl rounded-tr-sm border ${
                          isDark ? 'bg-blue-950/30 border-blue-500/30 text-slate-100' : 'bg-blue-50 border-blue-200 text-slate-900'
                        }`}>
                          <div className="text-[10px] font-mono text-blue-400 font-bold mb-1 uppercase tracking-wider flex items-center gap-1.5">
                            <User size={12} /> {character?.name || 'You'} (Turn {turn.turn_number})
                          </div>
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">{turn.player_action}</p>

                          {/* Attached Roll Badge */}
                          {turn.dice_roll && (
                            <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-400">
                              <Dices size={12} />
                              <span>{turn.dice_roll.notation} ➔ <b>{turn.dice_roll.total}</b></span>
                              {turn.dice_roll.isCrit && <span className="font-bold text-emerald-400">CRIT!</span>}
                              {turn.dice_roll.isFumble && <span className="font-bold text-rose-400">FUMBLE!</span>}
                            </div>
                          )}

                          {/* Attached Oracle Badge */}
                          {turn.oracle_result && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-[11px] font-mono text-purple-300">
                              <HelpCircle size={12} />
                              <span>Oracle: <b>{turn.oracle_result.answer}</b> ({turn.oracle_result.roll}/100)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* DM Response */}
                      <div className="flex justify-start">
                        <div className={`max-w-[90%] p-5 rounded-2xl rounded-tl-sm border relative group ${
                          isDark ? 'bg-slate-800/60 border-white/10 text-slate-200' : 'bg-amber-50/70 border-amber-200 text-slate-900'
                        }`}>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="text-[10px] font-mono text-amber-500 font-black uppercase tracking-wider flex items-center gap-1.5">
                              <Flame size={12} /> The Chronicler's Voice ({currentRuleset?.name || 'IMS Dungeon Master'})
                            </div>
                            <button
                              onClick={() => handleToggleSpeak(turn.id, turn.dm_narrative)}
                              className={`p-1.5 rounded-lg border transition-all text-xs flex items-center gap-1 ${
                                isSpeaking
                                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                                  : isDark
                                    ? 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/5'
                                    : 'bg-black/5 hover:bg-black/10 text-slate-600 border-black/5'
                              }`}
                              title={isSpeaking ? 'Stop narration' : 'Read aloud with The Chronicler'}
                            >
                              {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                            </button>
                          </div>
                          <div className="text-xs leading-relaxed whitespace-pre-wrap font-serif">
                            {turn.dm_narrative}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {processingTurn && (
                  <div className="flex justify-start">
                    <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
                      isDark ? 'bg-slate-800/40 border-white/10 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
                      <Flame size={18} className="animate-bounce" />
                      <span className="text-xs font-mono font-bold animate-pulse">The Chronicler writes your fate into the vellum...</span>
                    </div>
                  </div>
                )}

                <div ref={chronicleEndRef} />
              </div>

              {/* Action Bar Input */}
              <div className={`p-4 rounded-3xl border flex flex-col gap-3 ${
                isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/10'
              }`}>
                {/* Attached metadata chips */}
                {(attachedRoll || attachedOracle) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {attachedRoll && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-[11px] font-mono text-amber-300">
                        <Dices size={12} /> Roll: {attachedRoll.notation} = <b>{attachedRoll.total}</b>
                        <button onClick={() => setAttachedRoll(null)} className="ml-1 hover:text-white">✕</button>
                      </span>
                    )}
                    {attachedOracle && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 text-[11px] font-mono text-purple-300">
                        <HelpCircle size={12} /> Oracle: <b>{attachedOracle.answer}</b>
                        <button onClick={() => setAttachedOracle(null)} className="ml-1 hover:text-white">✕</button>
                      </span>
                    )}
                  </div>
                )}

                {/* Textarea + Submit */}
                <div className="flex gap-2 items-end">
                  <textarea
                    rows={2}
                    value={playerInput}
                    onChange={(e) => setPlayerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmitTurn();
                      }
                    }}
                    placeholder={`What does ${character?.name || 'your hero'} do next? (e.g. Draw weapon, examine altar, sneak into shadows...)`}
                    className={`flex-1 text-xs rounded-2xl p-3 border resize-none outline-none focus:border-amber-500 ${
                      isDark ? 'bg-slate-800 text-slate-100 border-white/10' : 'bg-slate-50 text-slate-900 border-[#2E2B27]/20'
                    }`}
                  />
                  <Btn
                    variant="filled"
                    onClick={() => handleSubmitTurn()}
                    disabled={processingTurn || !playerInput.trim()}
                    className="h-12 px-5"
                  >
                    <Send size={16} className={processingTurn ? 'animate-pulse' : ''} />
                  </Btn>
                </div>

                {/* Quick Action Suggestion Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    'Examine immediate surroundings',
                    'Search for hidden doors & traps',
                    'Draw weapon and take guard',
                    'Listen intently at the doorway',
                    'Rest, bandage wounds and catch breath',
                    'Consult Solo Fate Oracle'
                  ].map((act) => (
                    <button
                      key={act}
                      onClick={() => {
                        if (act === 'Consult Solo Fate Oracle') {
                          setActiveTab('dice');
                        } else {
                          handleSubmitTurn(act);
                        }
                      }}
                      className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-all ${
                        isDark
                          ? 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-300'
                          : 'bg-black/5 hover:bg-black/10 border-black/5 text-slate-700'
                      }`}
                    >
                      {act}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar Tools & The Chronicler Face (1 col) */}
            <div className="flex flex-col gap-4">
              {/* The Chronicler (Painted Animated Face from LOTR LCG) */}
              <div className={`p-4 rounded-3xl border flex flex-col items-center text-center gap-3 relative overflow-hidden ${
                isDark ? 'bg-slate-900/60 border-white/10' : 'bg-amber-50/80 border-amber-300/40 shadow-sm'
              }`}>
                <div className="w-full flex items-center justify-between pb-1 text-[10px] font-mono uppercase tracking-wider text-amber-500 font-bold border-b border-white/5">
                  <span className="flex items-center gap-1"><BookMarked size={12} /> The Chronicler</span>
                  <span className="capitalize">{chroniclerStatus}</span>
                </div>

                {/* Animated Chronicler Portrait */}
                <div className="relative w-40 h-40 rounded-2xl overflow-hidden border border-amber-500/30 shadow-[0_4px_24px_rgba(245,158,11,0.2)]">
                  <ChroniclerFace
                    face={{ emotion: chroniclerEmotion }}
                    status={chroniclerStatus}
                    levelRef={audioLevelRef}
                    width={160}
                  />
                </div>

                <div className="text-xs font-serif italic text-slate-300 px-2 leading-relaxed">
                  "I record every deed, every roll of the bone, and every drop of blood spilt in these dark ruins."
                </div>

                {/* Chronicler Emotion Controller */}
                <div className="flex flex-wrap justify-center gap-1 pt-1">
                  {['neutral', 'joy', 'fear', 'rage', 'amazement', 'suspicious'].map((em) => (
                    <button
                      key={em}
                      onClick={() => setChroniclerEmotion(em)}
                      className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded border transition-colors ${
                        chroniclerEmotion === em
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                          : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ruleset Summary */}
              {currentRuleset && (
                <div className={`p-4 rounded-3xl border flex flex-col gap-2 ${
                  isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white border-[#2E2B27]/10'
                }`}>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500">
                    <BookOpen size={14} /> Active Ruleset
                  </div>
                  <h4 className="font-black text-sm">{currentRuleset.name}</h4>
                  <div className="text-[11px] opacity-70">{currentRuleset.genre}</div>
                  <div className="text-[11px] font-mono mt-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    Dice: {currentRuleset.dice_system}
                  </div>
                </div>
              )}

              {/* Quick Hero Status Card */}
              {character && (
                <div className={`p-4 rounded-3xl border flex flex-col gap-3 ${
                  isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white border-[#2E2B27]/10'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Vital Signs</span>
                    <button
                      onClick={() => setActiveTab('character')}
                      className="text-[11px] font-bold text-amber-500 hover:underline flex items-center gap-0.5"
                    >
                      Full Sheet <ChevronRight size={12} />
                    </button>
                  </div>

                  {/* HP Controller */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <div className="flex items-center gap-2">
                      <Heart size={16} className="text-rose-500 fill-rose-500" />
                      <span className="text-sm font-black font-mono">{character.hp} / {character.max_hp}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleModifyHp(-1)}
                        className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-xs font-bold text-rose-300"
                        title="Take 1 Damage"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => handleModifyHp(1)}
                        className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-xs font-bold text-emerald-300"
                        title="Heal 1 HP"
                      >
                        +1
                      </button>
                    </div>
                  </div>

                  {/* Armor Class */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-sky-500" />
                      <span className="text-xs font-bold">Armor Class (AC)</span>
                    </div>
                    <span className="text-sm font-black font-mono">{character.ac}</span>
                  </div>

                  {/* Inventory Brief */}
                  <div className="flex flex-col gap-1.5 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Equipped Gear</span>
                    <div className="flex flex-wrap gap-1">
                      {character.inventory?.slice(0, 4).map((item, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/5 text-slate-300">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CHARACTER SHEET */}
        {activeTab === 'character' && (
          <div className="flex flex-col gap-6">
            {character ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Hero Profile & Vitals (1 col) */}
                <div className={`p-6 rounded-3xl border flex flex-col gap-6 ${
                  isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-[#2E2B27]/10'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black tracking-tight">{character.name}</h3>
                      <div className="text-xs font-mono opacity-70">{character.role_or_class} • Level {character.level}</div>
                    </div>
                  </div>

                  {/* Health Points & Hit Dice */}
                  <div className="flex flex-col gap-2 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                    <div className="flex justify-between items-center text-xs font-bold text-rose-400">
                      <span className="flex items-center gap-1.5"><Heart size={14} /> Hit Points</span>
                      <span className="font-mono text-sm">{character.hp} / {character.max_hp}</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${Math.round((character.hp / Math.max(1, character.max_hp)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex gap-2 justify-end mt-2">
                      <button
                        onClick={() => handleModifyHp(-5)}
                        className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-xs font-mono font-bold"
                      >
                        -5
                      </button>
                      <button
                        onClick={() => handleModifyHp(-1)}
                        className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-xs font-mono font-bold"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => handleModifyHp(1)}
                        className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-xs font-mono font-bold"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => handleModifyHp(5)}
                        className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-xs font-mono font-bold"
                      >
                        +5
                      </button>
                    </div>
                  </div>

                  {/* Defense & Speed */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                        <Shield size={12} /> Armor Class
                      </span>
                      <span className="text-xl font-black font-mono mt-1">{character.ac}</span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                        <Zap size={12} /> Ruleset
                      </span>
                      <span className="text-xs font-bold mt-1.5 truncate">{character.ruleset_id}</span>
                    </div>
                  </div>

                  {/* Backstory Notes */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Backstory & Chronicle Notes</span>
                    <p className={`text-xs leading-relaxed p-3 rounded-2xl border ${
                      isDark ? 'bg-white/5 border-white/5 text-slate-300' : 'bg-slate-50 border-black/5 text-slate-700'
                    }`}>
                      {character.backstory || 'No recorded lineage. A mysterious lone wanderer in the desolate frontier.'}
                    </p>
                  </div>
                </div>

                {/* Attributes Grid (1 col) */}
                <div className={`p-6 rounded-3xl border flex flex-col gap-4 ${
                  isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-[#2E2B27]/10'
                }`}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-2">
                      <Zap size={14} /> System Attributes
                    </h4>
                    <span className="text-[10px] font-mono text-slate-500">Click to Roll Check</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(character.attributes || {}).map(([attr, val]) => (
                      <button
                        key={attr}
                        onClick={async () => {
                          dndAudio.playSfx('dice_roll');
                          const res = await fetch('/api/dnd/roll', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ diceType: 'd20', count: 1 })
                          });
                          const data = await res.json();
                          if (data.success) {
                            setAttachedRoll(data.result);
                            setActiveTab('chronicle');
                            snack?.(`${attr} Check Rolled: ${data.result.total}`);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border text-left transition-all hover:scale-105 active:scale-95 group ${
                          isDark
                            ? 'bg-slate-800/80 hover:bg-slate-800 border-white/5 hover:border-amber-500/50'
                            : 'bg-slate-50 hover:bg-white border-black/5 hover:border-amber-500'
                        }`}
                      >
                        <div className="text-[10px] font-mono font-bold text-slate-400 group-hover:text-amber-500 uppercase">{attr}</div>
                        <div className="text-xl font-black font-mono mt-1">{val}</div>
                      </button>
                    ))}
                  </div>

                  {/* Skills / Feats */}
                  <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-white/10">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Award size={14} /> Skills & Proficiencies
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {character.skills?.map((sk, i) => (
                        <span key={i} className="text-xs font-mono px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Inventory Bag (1 col) */}
                <div className={`p-6 rounded-3xl border flex flex-col gap-4 ${
                  isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-[#2E2B27]/10'
                }`}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-2">
                      <Swords size={14} /> Inventory & Equipment
                    </h4>
                    <span className="text-xs font-mono font-bold text-slate-400">{character.inventory?.length || 0} Items</span>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto">
                    {character.inventory?.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-mono ${
                          isDark ? 'bg-white/5 border-white/5 text-slate-200' : 'bg-slate-50 border-black/5 text-slate-800'
                        }`}
                      >
                        <span>{item}</span>
                        <button
                          onClick={async () => {
                            const updatedInv = character.inventory.filter((_, i) => i !== idx);
                            const res = await fetch(`/api/dnd/characters/${character.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ inventory: updatedInv })
                            });
                            const data = await res.json();
                            if (data.success) setCharacter(data.character);
                          }}
                          className="opacity-40 hover:opacity-100 hover:text-rose-500"
                          title="Discard item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs opacity-60">No active character loaded.</div>
            )}
          </div>
        )}

        {/* TAB 3: DICE TRAY & SOLO FATE ORACLE */}
        {activeTab === 'dice' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 3D-Style Dice Roller */}
            <div className={`p-6 rounded-3xl border flex flex-col gap-6 ${
              isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-[#2E2B27]/10'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                    <Dices size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider">Physical Dice Tray</h3>
                    <span className="text-[11px] text-slate-500 font-mono">Animated rolling engine with audio clatter</span>
                  </div>
                </div>

                {/* Quick SFX Test Bar */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => dndAudio.playSfx('sword_clash')}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 text-xs"
                    title="Sword Clash SFX"
                  >
                    <Swords size={14} />
                  </button>
                  <button
                    onClick={() => dndAudio.playSfx('spell_cast')}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 text-xs"
                    title="Spell Cast SFX"
                  >
                    <Sparkles size={14} />
                  </button>
                  <button
                    onClick={() => dndAudio.playSfx('door_creak')}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 text-xs"
                    title="Door Creak SFX"
                  >
                    <Compass size={14} />
                  </button>
                </div>
              </div>

              {/* Dice Type Selectors */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDiceType(d);
                      dndAudio.playSfx('dice_roll');
                    }}
                    className={`py-3 rounded-2xl border font-mono font-black text-xs transition-all ${
                      diceType === d
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)] scale-105'
                        : isDark
                          ? 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-300'
                          : 'bg-black/5 hover:bg-black/10 border-black/5 text-slate-700'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Modifiers & Advantage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-mono uppercase text-slate-400">Dice Quantity: {diceCount}</span>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={diceCount}
                    onChange={(e) => setDiceCount(Number(e.target.value))}
                    className="accent-amber-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-mono uppercase text-slate-400">Modifier: {diceModifier >= 0 ? `+${diceModifier}` : diceModifier}</span>
                  <input
                    type="range"
                    min="-5"
                    max="10"
                    value={diceModifier}
                    onChange={(e) => setDiceModifier(Number(e.target.value))}
                    className="accent-amber-500"
                  />
                </div>
              </div>

              {diceType === 'd20' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAdvantage(!advantage); setDisadvantage(false); }}
                    className={`flex-1 py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                      advantage ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-400'
                    }`}
                  >
                    Advantage
                  </button>
                  <button
                    onClick={() => { setDisadvantage(!disadvantage); setAdvantage(false); }}
                    className={`flex-1 py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                      disadvantage ? 'bg-rose-500/20 border-rose-500 text-rose-400' : 'bg-white/5 border-white/5 text-slate-400'
                    }`}
                  >
                    Disadvantage
                  </button>
                </div>
              )}

              {/* Roll Trigger Button */}
              <Btn
                variant="filled"
                onClick={handleRollDice}
                disabled={isRolling}
                className="py-3 text-sm font-black"
              >
                <Dices size={18} className={`mr-2 ${isRolling ? 'animate-spin' : ''}`} />
                {isRolling ? 'Rolling Dice...' : `Roll ${diceCount}${diceType}${diceModifier ? (diceModifier > 0 ? `+${diceModifier}` : diceModifier) : ''}`}
              </Btn>

              {/* Roll Result Display */}
              {lastRoll && (
                <div className={`p-6 rounded-2xl border text-center flex flex-col items-center gap-2 ${
                  lastRoll.isCrit
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : lastRoll.isFumble
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                      : isDark
                        ? 'bg-slate-800 border-white/10 text-slate-100'
                        : 'bg-amber-50 border-amber-200 text-slate-900'
                }`}>
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-400">Total Result</span>
                  <div className="text-5xl font-black font-mono tracking-tight my-1">
                    {lastRoll.total}
                  </div>
                  <div className="text-xs font-mono opacity-80">
                    Dice: [{lastRoll.rolls?.join(', ')}] {lastRoll.modifier ? `${lastRoll.modifier >= 0 ? '+' : ''}${lastRoll.modifier}` : ''}
                  </div>
                  {lastRoll.isCrit && <div className="text-xs font-black uppercase tracking-widest text-emerald-400 mt-1">★ NATURAL 20 / CRITICAL SUCCESS ★</div>}
                  {lastRoll.isFumble && <div className="text-xs font-black uppercase tracking-widest text-rose-400 mt-1">⚠ NATURAL 1 / FUMBLE ⚠</div>}

                  <Btn
                    variant="tonal"
                    onClick={() => {
                      setAttachedRoll(lastRoll);
                      setActiveTab('chronicle');
                      snack?.('Roll attached to next player action!');
                    }}
                    className="mt-3 text-xs"
                  >
                    Attach to Adventure Turn ➔
                  </Btn>
                </div>
              )}
            </div>

            {/* Solo Fate Oracle */}
            <div className={`p-6 rounded-3xl border flex flex-col gap-6 ${
              isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-[#2E2B27]/10'
            }`}>
              <div className="flex items-center gap-2">
                <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
                  <HelpCircle size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">Solo Fate Oracle</h3>
                  <span className="text-[11px] text-slate-500 font-mono">Answer closed (yes/no) story queries</span>
                </div>
              </div>

              {/* Likelihood Selector */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-slate-400 uppercase">Likelihood Odds</span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {['Impossible', 'Unlikely', '50/50', 'Likely', 'Almost Certain'].map((lk) => (
                    <button
                      key={lk}
                      onClick={() => setOracleLikelihood(lk)}
                      className={`py-2 rounded-xl border text-[11px] font-mono font-bold transition-all ${
                        oracleLikelihood === lk
                          ? 'bg-purple-600 text-white border-purple-600 shadow-[0_0_12px_rgba(147,51,234,0.4)]'
                          : isDark
                            ? 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                            : 'bg-black/5 border-black/5 text-slate-700 hover:text-slate-950'
                      }`}
                    >
                      {lk}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question Input */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-slate-400 uppercase">Question for the Fate Oracle</span>
                <input
                  type="text"
                  value={oracleQuestion}
                  onChange={(e) => setOracleQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConsultOracle()}
                  placeholder="e.g. Is the rusted prison door locked? Does the creature hear me?"
                  className={`p-3 rounded-2xl border text-xs outline-none focus:border-purple-500 ${
                    isDark ? 'bg-slate-800 text-slate-100 border-white/10' : 'bg-slate-50 text-slate-900 border-black/10'
                  }`}
                />
              </div>

              <Btn
                variant="filled"
                onClick={handleConsultOracle}
                disabled={!oracleQuestion.trim()}
                className="py-3 text-xs font-black bg-purple-600 hover:bg-purple-500 text-white"
              >
                <HelpCircle size={16} className="mr-1.5" /> Consult the Oracle (d100)
              </Btn>

              {/* Oracle Result */}
              {lastOracle && (
                <div className={`p-6 rounded-2xl border text-center flex flex-col items-center gap-2 ${
                  isDark ? 'bg-purple-950/20 border-purple-500/30 text-purple-200' : 'bg-purple-50 border-purple-200 text-purple-950'
                }`}>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400">Oracle Pronouncement</span>
                  <div className="text-3xl font-black font-serif my-1">
                    {lastOracle.answer}
                  </div>
                  <div className="text-xs font-mono opacity-80">
                    d100 Roll: <b>{lastOracle.roll}</b> (Odds: {lastOracle.likelihood})
                  </div>

                  <Btn
                    variant="tonal"
                    onClick={() => {
                      setAttachedOracle(lastOracle);
                      setActiveTab('chronicle');
                      snack?.('Oracle pronouncement attached to your next action!');
                    }}
                    className="mt-3 text-xs"
                  >
                    Attach to Adventure Turn ➔
                  </Btn>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: RULEBOOKS, ASSETS & FREE AUDIO REPOSITORIES */}
        {activeTab === 'sourcebooks' && (
          <div className="flex flex-col gap-8">
            {/* Scanned Books Section */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black tracking-tight">Scanned D&D & Tabletop RPG Library</h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Dynamic books and expansions discovered in <code>G:\My Drive\BOOKS\D&D</code>
                  </p>
                </div>
                <Btn variant="tonal" onClick={handleScanLibrary} disabled={scanning} className="text-xs">
                  <RefreshCw size={14} className={`mr-1.5 ${scanning ? 'animate-spin' : ''}`} /> Refresh Library
                </Btn>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rulesets.map((rule) => {
                  const meta = rule.metadata || {};
                  const books = meta.books || [];
                  const maps = meta.maps || [];
                  const sheets = meta.sheets || [];

                  return (
                    <div
                      key={rule.id}
                      className={`p-6 rounded-3xl border flex flex-col justify-between gap-4 transition-all hover:border-amber-500/40 ${
                        isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-[#2E2B27]/10'
                      }`}
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-500">
                            {rule.genre || 'Solo RPG'}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5 text-slate-400">
                            {rule.dice_system}
                          </span>
                        </div>

                        <h4 className="text-base font-black tracking-tight">{rule.name}</h4>
                        <p className={`text-xs leading-relaxed line-clamp-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          {rule.description}
                        </p>

                        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10 text-[11px] font-mono text-slate-400">
                          <span>{books.length} Books</span> • <span>{maps.length} Maps</span> • <span>{sheets.length} Sheets</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        {maps.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {maps.slice(0, 3).map((mapPath, i) => (
                              <button
                                key={i}
                                onClick={() => setSelectedAsset({ type: 'image', path: mapPath, title: `${rule.name} - Battle Map ${i + 1}` })}
                                className="text-[10px] font-mono px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 flex items-center gap-1"
                              >
                                <ImageIcon size={10} /> Map {i + 1}
                              </button>
                            ))}
                          </div>
                        )}

                        <Btn
                          variant="tonal"
                          onClick={() => {
                            setNewRulesetId(rule.id);
                            setNewTitle(`${rule.name} - Solo Campaign`);
                            setShowNewCampaign(true);
                          }}
                          className="w-full text-xs"
                        >
                          Launch Campaign in this System ➔
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Curated Free Audio & Sound Effects Repositories */}
            <div className={`p-6 rounded-3xl border flex flex-col gap-4 ${
              isDark ? 'bg-slate-900/40 border-white/10' : 'bg-amber-50/50 border-[#2E2B27]/10'
            }`}>
              <div className="flex items-center gap-2 text-amber-500">
                <Radio size={20} />
                <h3 className="text-base font-black tracking-tight">Free D&D Sound Effects & Audio Repositories</h3>
              </div>
              <p className={`text-xs leading-relaxed max-w-3xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                To expand your audio library beyond IMS's built-in procedural synthesizer, these reputable free repositories provide thousands of open-source and Creative Commons tabletop sound effects, battle cries, spells, and ambient loops:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {FREE_SOUND_REPOSITORIES.map((repo) => (
                  <div
                    key={repo.name}
                    className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
                      isDark ? 'bg-slate-800/60 border-white/5' : 'bg-white border-black/5 shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-sm">{repo.name}</h4>
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-mono"
                        >
                          Visit <ExternalLink size={12} />
                        </a>
                      </div>
                      <div className="text-[10px] font-mono text-emerald-400 mt-0.5">{repo.license}</div>
                      <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {repo.desc}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {repo.tags.map((t) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/5 text-slate-300">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Illuminated Chronicle Manuscript (LOTR LCG Integration) */}
        {showChronicleManuscript && activeCampaign && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className={`max-w-3xl w-full max-h-[90vh] overflow-y-auto p-8 rounded-3xl border shadow-2xl flex flex-col gap-6 ${
              isDark ? 'bg-[#0f111a] border-amber-500/30 text-amber-100' : 'bg-[#faf6ee] border-amber-400 text-stone-900'
            }`}>
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden border border-amber-500/40">
                    <ChroniclerFace face={{ emotion: 'neutral' }} status="idle" width={48} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-500 font-bold">Illuminated Manuscript</span>
                    <h2 className="text-xl font-serif font-black tracking-tight">{activeCampaign.title}</h2>
                  </div>
                </div>
                <button
                  onClick={() => setShowChronicleManuscript(false)}
                  className="px-3 py-1.5 rounded-xl border border-amber-500/30 text-xs font-mono font-bold hover:bg-amber-500/10"
                >
                  Close
                </button>
              </div>

              {/* Manuscript Body */}
              <div className="flex flex-col gap-6 font-serif leading-relaxed px-2">
                <div className="text-center italic border-b border-amber-500/10 pb-4 text-xs opacity-70">
                  Set down by the Chronicler, from the telling of {character?.name || 'the Wanderer'}
                </div>

                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/15 text-sm">
                  <b>Prologue:</b> {activeCampaign.premise || activeCampaign.setting_description}
                </div>

                {activeCampaign.turns?.map((turn, idx) => (
                  <div key={turn.id || idx} className="flex flex-col gap-2 pt-2 border-t border-amber-500/10">
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-500">
                      Chapter {turn.turn_number}: The Action of {character?.name || 'the Hero'}
                    </div>
                    <p className="text-xs italic opacity-85">
                      "{turn.player_action}"
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {turn.dm_narrative}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create New Campaign */}
        {showNewCampaign && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`max-w-lg w-full p-6 rounded-3xl border shadow-2xl flex flex-col gap-5 ${
              isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/20 text-slate-900'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame size={20} className="text-amber-500" />
                  <h3 className="text-base font-black tracking-tight">Initiate Solo RPG Campaign</h3>
                </div>
                <button onClick={() => setShowNewCampaign(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleCreateCampaign} className="flex flex-col gap-4 text-xs font-mono">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 uppercase font-bold">Campaign Title</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Incursion on Derelict Station 9"
                    className={`p-3 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-800 border-white/10' : 'bg-slate-50 border-black/10'
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 uppercase font-bold">Select Tabletop Ruleset</label>
                  <select
                    value={newRulesetId}
                    onChange={(e) => setNewRulesetId(e.target.value)}
                    className={`p-3 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-800 border-white/10' : 'bg-slate-50 border-black/10'
                    }`}
                  >
                    {rulesets.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.genre})</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 uppercase font-bold">Hero Name</label>
                  <input
                    type="text"
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    placeholder="e.g. Captain Vane / Brother Timothy"
                    className={`p-3 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-800 border-white/10' : 'bg-slate-50 border-black/10'
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 uppercase font-bold">Opening Scene Premise (Optional)</label>
                  <textarea
                    rows={3}
                    value={newPremise}
                    onChange={(e) => setNewPremise(e.target.value)}
                    placeholder="Describe how the story begins, or leave blank for the Dungeon Master to craft the opening hook..."
                    className={`p-3 rounded-xl border resize-none outline-none ${
                      isDark ? 'bg-slate-800 border-white/10' : 'bg-slate-50 border-black/10'
                    }`}
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Btn variant="tonal" onClick={() => setShowNewCampaign(false)}>Cancel</Btn>
                  <Btn variant="filled" type="submit">Start Adventure</Btn>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Asset / Map Viewer */}
        {selectedAsset && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col p-6">
            <div className="flex items-center justify-between pb-4">
              <span className="font-bold text-sm text-white">{selectedAsset.title}</span>
              <button
                onClick={() => setSelectedAsset(null)}
                className="px-3 py-1 rounded-xl bg-white/10 text-white hover:bg-white/20 text-xs font-mono font-bold"
              >
                Close (ESC)
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-auto rounded-2xl bg-black/40 border border-white/10 p-2">
              <img
                src={`/api/dnd/asset?path=${encodeURIComponent(selectedAsset.path)}`}
                alt={selectedAsset.title}
                className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>
          </div>
        )}
      </div>
    </ServicePage>
  );
}
