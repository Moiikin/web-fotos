import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Check,
  Film,
  Heart,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Music2,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const supabase: SupabaseClient | null = isConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

type Duo = { id: string; invite_code: string };
type Profile = {
  display_name: string;
  avatar_path: string | null;
  wallpaper_path: string | null;
  avatarUrl: string;
  wallpaperUrl: string;
};
type Memory = {
  id: string;
  duo_id: string;
  uploaded_by: string;
  storage_path: string | null;
  media_type: "photo" | "video" | "audio" | "sticker";
  sticker_code: string | null;
  caption: string;
  created_at: string;
  mediaUrl: string;
  reactions: string[];
};
type MemoryFilter = "all" | "photo" | "video" | "sticker" | "audio";
const stickerOptions = ["💖", "🌸", "🧸", "✨", "🦋", "🍓", "🌷", "🐻‍❄️", "☀️", "🌙", "🥹", "🎀"];
const memoryTypes: { id: MemoryFilter; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "photo", label: "Fotos" },
  { id: "video", label: "Videos" },
  { id: "sticker", label: "Stickers" },
  { id: "audio", label: "Música" },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [duo, setDuo] = useState<Duo | null>(null);
  const [photos, setPhotos] = useState<Memory[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingDuo, setLoadingDuo] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState<MemoryFilter>("all");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "SIGNED_OUT") {
        setDuo(null);
        setPhotos([]);
        setProfile(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    let cancelled = false;
    setLoadingDuo(true);
    setError("");
    void (async () => {
      try {
        const { data: membership, error: membershipError } = await supabase
          .from("duo_members")
          .select("duo_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) {
          if (!cancelled) setDuo(null);
          return;
        }
        const { data, error: duoError } = await supabase
          .from("duos")
          .select("id, invite_code")
          .eq("id", membership.duo_id)
          .single();
        if (duoError) throw duoError;
        if (!cancelled) setDuo(data);
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      } finally {
        if (!cancelled) setLoadingDuo(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!supabase || !duo) return;
    void loadPhotos();
  }, [duo]);

  useEffect(() => {
    if (!supabase || !duo || !session) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error: profileError } = await supabase
          .from("user_profiles")
          .select("display_name, avatar_path, wallpaper_path")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        const avatarResult = data?.avatar_path
          ? await supabase.storage.from("duo-photos").createSignedUrl(data.avatar_path, 60 * 60)
          : null;
        if (avatarResult?.error) throw avatarResult.error;
        const wallpaperResult = data?.wallpaper_path
          ? await supabase.storage.from("duo-photos").createSignedUrl(data.wallpaper_path, 60 * 60)
          : null;
        if (wallpaperResult?.error) throw wallpaperResult.error;
        if (!cancelled) {
          setProfile({
            display_name: data?.display_name || session.user.email?.split("@")[0] || "Mi perfil",
            avatar_path: data?.avatar_path ?? null,
            wallpaper_path: data?.wallpaper_path ?? null,
            avatarUrl: avatarResult?.data.signedUrl ?? "",
            wallpaperUrl: wallpaperResult?.data.signedUrl ?? "",
          });
        }
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [duo, session]);

  async function loadPhotos() {
    if (!supabase || !duo) return;
    setLoadingPhotos(true);
    setError("");
    try {
      const { data: photoRows, error: photosError } = await supabase
        .from("photos")
        .select("id, duo_id, uploaded_by, storage_path, media_type, sticker_code, caption, created_at")
        .eq("duo_id", duo.id)
        .order("created_at", { ascending: false });
      if (photosError) throw photosError;

      const ids = (photoRows ?? []).map((photo) => photo.id);
      const { data: reactions, error: reactionsError } = ids.length
        ? await supabase.from("photo_reactions").select("photo_id, user_id").in("photo_id", ids)
        : { data: [], error: null };
      if (reactionsError) throw reactionsError;

      const hydrated = await Promise.all(
        (photoRows ?? []).map(async (photo) => {
          const signed = photo.storage_path
            ? await supabase.storage.from("duo-photos").createSignedUrl(photo.storage_path, 60 * 60)
            : null;
          if (signed?.error) throw signed.error;
          return {
            ...photo,
            mediaUrl: signed?.data.signedUrl ?? "",
            reactions: (reactions ?? [])
              .filter((reaction) => reaction.photo_id === photo.id)
              .map((reaction) => reaction.user_id),
          };
        }),
      );
      setPhotos(hydrated);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  if (!isConfigured) return <SetupScreen />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Entre nosotras, inicio">
          <span className="brand-mark"><Heart size={17} fill="currentColor" /></span>
          <span>entre nosotras<span className="brand-period">.</span></span>
        </a>
        {session && (
          <div className="topbar-user">
            {duo && <button className="profile-trigger" onClick={() => setShowProfile(true)} aria-label="Configurar mi perfil">
              {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{profile?.display_name.slice(0, 1).toUpperCase() || "T"}</span>}
              <span className="profile-trigger-name">{profile?.display_name || session.user.email}</span>
              <Settings2 size={15} />
            </button>}
            <button className="icon-button" onClick={() => void signOut()} aria-label="Cerrar sesión">
              <LogOut size={17} />
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="toast error-toast" role="alert">
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError("")} aria-label="Cerrar aviso"><X size={16} /></button>
        </div>
      )}
      {notice && (
        <div className="toast success-toast" role="status">
          <Check size={17} /><span>{notice}</span>
          <button className="icon-button" onClick={() => setNotice("")} aria-label="Cerrar aviso"><X size={16} /></button>
        </div>
      )}

      {!authReady ? (
        <div className="center-loading"><LoaderCircle className="spin" size={24} /></div>
      ) : !session ? (
        <AuthScreen
          mode={authMode}
          onModeChange={setAuthMode}
          onNotice={setNotice}
          onError={setError}
        />
      ) : loadingDuo ? (
        <div className="center-loading"><LoaderCircle className="spin" size={24} /></div>
      ) : !duo ? (
        <DuoSetup
          onDuo={(createdDuo) => setDuo(createdDuo)}
          onError={setError}
          onNotice={setNotice}
        />
      ) : (
        <>
          <section className={`hero${profile?.wallpaperUrl ? " hero-with-wallpaper" : ""}`} style={profile?.wallpaperUrl ? { backgroundImage: `linear-gradient(90deg, #eeeee7f2 0%, #eeeee7d9 55%, #eeeee740 100%), url("${profile.wallpaperUrl}")` } : undefined}>
            <div className="hero-copy">
              <div className="eyebrow"><Sparkles size={14} /> SU ESPACIO, SOLO DE USTEDES</div>
              <h1>Los días bonitos<br />se guardan <em>juntas.</em></h1>
              <p>Un álbum privado para todas esas cosas que no quieren olvidar.</p>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-card art-card-back"><span>✳</span></div>
              <div className="art-card art-card-front">
                <div className="art-sun" />
                <div className="art-hill hill-one" />
                <div className="art-hill hill-two" />
                <span className="art-date">un día para recordar</span>
              </div>
              <div className="art-heart"><Heart size={18} fill="currentColor" /></div>
            </div>
          </section>

          <section className="album-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow section-eyebrow"><span className="heading-dot" /> SU ÁLBUM</div>
                <h2>Momentos compartidos <span className="photo-count">{photos.length}</span></h2>
              </div>
              <div className="album-actions">
                <button className="icon-button refresh-button" onClick={() => void loadPhotos()} disabled={loadingPhotos} aria-label="Actualizar fotos">
                  <RefreshCw size={16} className={loadingPhotos ? "spin" : ""} />
                </button>
                <button className="button button-primary upload-button" onClick={() => setShowUpload(true)}>
                  <Plus size={17} /> Subir un recuerdo
                </button>
              </div>
            </div>

            <nav className="memory-filters" aria-label="Filtrar recuerdos">
              {memoryTypes.map((type) => (
                <button key={type.id} className={`filter-chip${memoryFilter === type.id ? " active" : ""}`} onClick={() => setMemoryFilter(type.id)}>
                  {type.id === "video" ? <Film size={14} /> : type.id === "audio" ? <Music2 size={14} /> : null}
                  {type.label}
                  {type.id === "all" && <span>{photos.length}</span>}
                </button>
              ))}
            </nav>

            {(() => {
              const filteredPhotos = memoryFilter === "all" ? photos : photos.filter((photo) => photo.media_type === memoryFilter);
              return loadingPhotos ? (
                <div className="feed-loading"><LoaderCircle className="spin" size={22} /> Cargando sus recuerdos...</div>
              ) : filteredPhotos.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">{memoryFilter === "audio" ? <Music2 size={25} /> : memoryFilter === "video" ? <Film size={25} /> : <Camera size={25} />}</div>
                <h3>{photos.length === 0 ? "Todo recuerdo tiene un comienzo" : "Todavía no hay recuerdos aquí"}</h3>
                <p>{photos.length === 0 ? "Suban esa primera foto, canción o video que les saque una sonrisa." : `Cuando compartan ${memoryTypes.find((type) => type.id === memoryFilter)?.label.toLowerCase()}, aparecerán aquí.`}</p>
                <button className="button button-primary" onClick={() => setShowUpload(true)}><Plus size={17} /> Añadir un recuerdo</button>
              </div>
              ) : (
              <div className="photo-grid">
                {filteredPhotos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    userId={session.user.id}
                    onError={setError}
                    onPhotosChanged={() => void loadPhotos()}
                  />
                ))}
              </div>
              );
            })()}
          </section>
          <footer className="app-footer"><LockKeyhole size={13} /> Un espacio privado, creado para dos <span>·</span> Código de invitación: <strong>{duo.invite_code}</strong></footer>
        </>
      )}

      {showUpload && duo && (
        <UploadDialog
          duo={duo}
          userId={session!.user.id}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            setNotice("Su recuerdo ya está en el álbum 💛");
            void loadPhotos();
          }}
          onError={setError}
        />
      )}
      {showProfile && duo && session && (
        <ProfileDialog
          duo={duo}
          userId={session.user.id}
          initialProfile={profile}
          onClose={() => setShowProfile(false)}
          onSaved={(savedProfile) => {
            setProfile(savedProfile);
            setShowProfile(false);
            setNotice("Tu perfil quedó actualizado.");
          }}
          onError={setError}
        />
      )}
    </main>
  );
}

function AuthScreen({
  mode,
  onModeChange,
  onNotice,
  onError,
}: {
  mode: "login" | "signup";
  onModeChange: (mode: "login" | "signup") => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    onError("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (!data.session) onNotice("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (cause) {
      onError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-intro">
        <div className="eyebrow"><LockKeyhole size={14} /> UN RINCÓN PRIVADO PARA DOS</div>
        <h1>Su historia,<br />en un lugar <em>de ustedes.</em></h1>
        <p>Fotos espontáneas, días especiales y todo eso que vale la pena guardar. Solo tú y tu amiga.</p>
        <div className="auth-stamp"><Heart size={17} fill="currentColor" /><span>hecho para compartir</span></div>
      </div>
      <div className="auth-card">
        <div className="auth-card-icon"><Heart size={20} fill="currentColor" /></div>
        <h2>{mode === "login" ? "Qué alegría verte" : "Empiecen su álbum"}</h2>
        <p className="auth-subtitle">{mode === "login" ? "Entra a su pequeño rincón." : "Crea una cuenta para guardar sus recuerdos."}</p>
        <form onSubmit={(event) => void submit(event)} className="form-stack">
          <label className="field-label" htmlFor="email">Correo electrónico</label>
          <div className="input-wrap"><Mail size={17} /><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" autoComplete="email" required /></div>
          <label className="field-label" htmlFor="password">Contraseña</label>
          <input className="plain-input" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Al menos 6 caracteres" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required />
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : null}
            {mode === "login" ? "Entrar a nuestro espacio" : "Crear mi cuenta"}
            {!busy && <ArrowUpRight size={17} />}
          </button>
        </form>
        <div className="auth-divider"><span>o</span></div>
        <p className="auth-switch">
          {mode === "login" ? "¿Todavía no tienes cuenta?" : "¿Ya tienes una cuenta?"}{" "}
          <button onClick={() => onModeChange(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Crear cuenta" : "Iniciar sesión"}</button>
        </p>
        <div className="privacy-note"><LockKeyhole size={13} /> Sus fotos nunca serán públicas.</div>
      </div>
    </section>
  );
}

function DuoSetup({
  onDuo,
  onError,
  onNotice,
}: {
  onDuo: (duo: Duo) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function createDuo() {
    if (!supabase) return;
    setBusy(true);
    onError("");
    try {
      const { data: code, error: rpcError } = await supabase.rpc("create_duo");
      if (rpcError) throw rpcError;
      const { data, error: duoError } = await supabase.from("duos").select("id, invite_code").eq("invite_code", code).single();
      if (duoError) throw duoError;
      onDuo(data);
      onNotice(`Su espacio ya está listo. Comparte este código con tu amiga: ${code}`);
    } catch (cause) {
      onError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function joinDuo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    onError("");
    try {
      const { data: duoId, error: rpcError } = await supabase.rpc("join_duo", { invite_code_input: inviteCode.trim().toUpperCase() });
      if (rpcError) throw rpcError;
      const { data, error: duoError } = await supabase.from("duos").select("id, invite_code").eq("id", duoId).single();
      if (duoError) throw duoError;
      onDuo(data);
    } catch (cause) {
      onError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="duo-layout">
      <button className="back-link" onClick={() => void supabase?.auth.signOut()}><ArrowLeft size={15} /> Cerrar sesión</button>
      <div className="duo-heading">
        <div className="eyebrow"><UsersRound size={14} /> CASI LISTO</div>
        <h1>Este álbum es<br />para <em>dos.</em></h1>
        <p>Crea su espacio y comparte el código con tu amiga, o únete con el que ella te envió.</p>
      </div>
      <div className="duo-options">
        <article className="duo-option create-option">
          <div className="option-icon"><Plus size={20} /></div>
          <h2>Crear nuestro espacio</h2>
          <p>Abre un álbum privado y recibe un código único para invitarla.</p>
          <button className="button button-primary" onClick={() => void createDuo()} disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : null} Crear álbum
          </button>
        </article>
        <div className="option-or">O</div>
        <article className="duo-option">
          <div className="option-icon option-icon-soft"><Heart size={19} /></div>
          <h2>Ya tengo un código</h2>
          <p>Escribe el código de invitación que te compartió tu amiga.</p>
          <form className="join-form" onSubmit={(event) => void joinDuo(event)}>
            <input className="plain-input code-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="EJ. A1B2C3D4" maxLength={8} aria-label="Código de invitación" required />
            <button className="button button-outline" type="submit" disabled={busy || inviteCode.length < 8}>
              {busy ? <LoaderCircle size={17} className="spin" /> : "Unirme"}
            </button>
          </form>
        </article>
      </div>
      <div className="duo-privacy"><LockKeyhole size={14} /> Cada álbum admite solo dos cuentas. Sus fotos son privadas.</div>
    </section>
  );
}

function PhotoCard({
  photo,
  userId,
  onError,
  onPhotosChanged,
}: {
  photo: Memory;
  userId: string;
  onError: (message: string) => void;
  onPhotosChanged: () => void;
}) {
  const [liking, setLiking] = useState(false);
  const liked = photo.reactions.includes(userId);
  const date = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric" }).format(new Date(photo.created_at));

  async function toggleLike() {
    if (!supabase || liking) return;
    setLiking(true);
    onError("");
    try {
      const result = liked
        ? await supabase.from("photo_reactions").delete().eq("photo_id", photo.id).eq("user_id", userId)
        : await supabase.from("photo_reactions").insert({ photo_id: photo.id, user_id: userId });
      if (result.error) throw result.error;
      onPhotosChanged();
    } catch (cause) {
      onError(errorMessage(cause));
    } finally {
      setLiking(false);
    }
  }

  return (
    <article className={`photo-card memory-${photo.media_type}`}>
      {photo.media_type === "sticker" ? (
        <div className="sticker-memory" role="img" aria-label={`Sticker ${photo.sticker_code ?? ""}`}>
          <span>{photo.sticker_code}</span>
          <span className="sticker-sparkle">✦</span>
        </div>
      ) : photo.media_type === "video" ? (
        <video className="memory-video" src={photo.mediaUrl} controls preload="metadata" playsInline />
      ) : photo.media_type === "audio" ? (
        <div className="music-memory">
          <div className="music-cover"><Music2 size={28} /></div>
          <span className="music-label">CANCIÓN PARA RECORDAR</span>
          <audio src={photo.mediaUrl} controls preload="metadata" />
        </div>
      ) : (
        <a className="photo-image-link" href={photo.mediaUrl} target="_blank" rel="noreferrer" aria-label="Abrir foto en tamaño completo">
          <img className="photo-image" src={photo.mediaUrl} alt={photo.caption || "Recuerdo compartido"} loading="lazy" />
          <span className="photo-open"><ArrowUpRight size={16} /></span>
        </a>
      )}
      <div className="photo-info">
        <div className="photo-date">{date}</div>
        {photo.caption && <p className="photo-caption">{photo.caption}</p>}
        <div className="photo-bottom">
          <span className="photo-byline"><span className="tiny-heart"><Heart size={11} fill="currentColor" /></span> guardado con cariño</span>
          <button className={`like-button${liked ? " liked" : ""}`} onClick={() => void toggleLike()} disabled={liking} aria-label={liked ? "Quitar corazón" : "Enviar corazón"}>
            <Heart size={16} fill={liked ? "currentColor" : "none"} /> {photo.reactions.length || ""}
          </button>
        </div>
      </div>
    </article>
  );
}

function UploadDialog({
  duo,
  userId,
  onClose,
  onUploaded,
  onError,
}: {
  duo: Duo;
  userId: string;
  onClose: () => void;
  onUploaded: () => void;
  onError: (message: string) => void;
}) {
  const [mediaType, setMediaType] = useState<"photo" | "video" | "audio" | "sticker">("photo");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [sticker, setSticker] = useState(stickerOptions[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    const allowedTypes: Record<"photo" | "video" | "audio", string[]> = {
      photo: ["image/jpeg", "image/png", "image/gif", "image/webp"],
      video: ["video/mp4", "video/webm", "video/quicktime"],
      audio: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/ogg", "audio/webm", "audio/x-wav"],
    };
    if (mediaType === "sticker" || !allowedTypes[mediaType].includes(nextFile.type)) {
      onError(mediaType === "photo" ? "Elige una foto JPG, PNG, GIF o WEBP." : mediaType === "video" ? "Elige un video MP4, WebM o MOV." : "Elige un audio MP3, M4A, AAC, WAV, OGG o WebM.");
      return;
    }
    const maxSize = mediaType === "photo" ? 10 : mediaType === "video" ? 50 : 20;
    if (nextFile.size > maxSize * 1024 * 1024) {
      onError(`El archivo debe pesar menos de ${maxSize} MB.`);
      return;
    }
    onError("");
    setFile(nextFile);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || (mediaType !== "sticker" && !file)) return;
    setBusy(true);
    onError("");
    const storagePath = file ? `${duo.id}/${crypto.randomUUID()}` : null;
    try {
      if (file && storagePath) {
        const { error: uploadError } = await supabase.storage.from("duo-photos").upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error: insertError } = await supabase.from("photos").insert({
        duo_id: duo.id,
        uploaded_by: userId,
        storage_path: storagePath,
        media_type: mediaType,
        sticker_code: mediaType === "sticker" ? sticker : null,
        caption: caption.trim(),
      });
      if (insertError) {
        if (storagePath) {
          const { error: cleanupError } = await supabase.storage.from("duo-photos").remove([storagePath]);
          if (cleanupError) throw new Error(`${insertError.message}. No se pudo limpiar el archivo subido: ${cleanupError.message}`);
        }
        throw insertError;
      }
      onUploaded();
    } catch (cause) {
      onError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="modal-heading">
          <div><div className="eyebrow">UN MOMENTO PARA GUARDAR</div><h2 id="upload-title">Añadir un recuerdo</h2></div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={19} /></button>
        </div>
        <div className="upload-types" role="group" aria-label="Tipo de recuerdo">
          {memoryTypes.slice(1).map((type) => (
            <button key={type.id} type="button" aria-pressed={mediaType === type.id} className={mediaType === type.id ? "selected" : ""} onClick={() => { setMediaType(type.id as typeof mediaType); setFile(null); setCaption(""); }}>
              {type.id === "photo" ? <ImagePlus size={15} /> : type.id === "video" ? <Film size={15} /> : type.id === "audio" ? <Music2 size={15} /> : <span>💖</span>}
              {type.label === "Fotos" ? "Foto" : type.label === "Stickers" ? "Sticker" : type.label}
            </button>
          ))}
        </div>
        <form onSubmit={(event) => void upload(event)} className="form-stack">
          {mediaType === "sticker" ? (
            <div className="sticker-picker" aria-label="Elige un sticker">
              {stickerOptions.map((option) => <button type="button" key={option} aria-label={`Elegir ${option}`} aria-pressed={sticker === option} className={sticker === option ? "chosen" : ""} onClick={() => setSticker(option)}>{option}</button>)}
            </div>
          ) : (
            <label className={`drop-zone${preview ? " has-preview" : ""}`} htmlFor="memory-file">
              {preview ? mediaType === "video" ? <video src={preview} muted playsInline /> : mediaType === "audio" ? <div className="audio-preview"><Music2 size={26} /><span>{file?.name}</span></div> : <img src={preview} alt="Vista previa de la foto" /> : (
                <><span className="drop-icon">{mediaType === "video" ? <Film size={22} /> : mediaType === "audio" ? <Music2 size={22} /> : <ImagePlus size={22} />}</span><strong>{mediaType === "photo" ? "Elige una foto para compartir" : mediaType === "video" ? "Elige un video para compartir" : "Elige una canción o audio"}</strong><span>{mediaType === "photo" ? "JPG, PNG, GIF o WEBP · Máximo 10 MB" : mediaType === "video" ? "MP4, WebM o MOV · Máximo 50 MB" : "MP3, M4A, AAC, WAV, OGG · Máximo 20 MB"}</span></>
              )}
              <input id="memory-file" type="file" accept={mediaType === "photo" ? "image/jpeg,image/png,image/gif,image/webp" : mediaType === "video" ? "video/mp4,video/webm,video/quicktime" : "audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,audio/webm"} onChange={(event) => chooseFile(event.target.files?.[0])} />
              {preview && <span className="change-photo"><ImagePlus size={14} /> Cambiar archivo</span>}
            </label>
          )}
          {mediaType === "sticker" && <label className="field-label" htmlFor="sticker-caption">Añade una notita <span className="optional-label">opcional</span></label>}
          {mediaType !== "sticker" && <label className="field-label" htmlFor="caption">Una notita <span className="optional-label">opcional</span></label>}
          <textarea id={mediaType === "sticker" ? "sticker-caption" : "caption"} className="plain-input caption-input" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder={mediaType === "audio" ? "Nombre de la canción o un recuerdo..." : "¿Qué quieren recordar de este día?"} maxLength={500} rows={3} />
          <button className="button button-primary auth-submit" type="submit" disabled={(mediaType !== "sticker" && !file) || busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowDownToLine size={17} />}
            {busy ? "Guardando su recuerdo..." : "Guardar en nuestro álbum"}
          </button>
        </form>
      </section>
    </div>
  );
}

function ProfileDialog({
  duo,
  userId,
  initialProfile,
  onClose,
  onSaved,
  onError,
}: {
  duo: Duo;
  userId: string;
  initialProfile: Profile | null;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
  onError: (message: string) => void;
}) {
  const [displayName, setDisplayName] = useState(initialProfile?.display_name ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [wallpaperFile, setWallpaperFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(initialProfile?.avatarUrl ?? "");
  const [wallpaperPreview, setWallpaperPreview] = useState(initialProfile?.wallpaperUrl ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!wallpaperFile) return;
    const url = URL.createObjectURL(wallpaperFile);
    setWallpaperPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [wallpaperFile]);

  function validateImage(file: File, label: string): boolean {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onError(`${label}: elige una imagen JPG, PNG o WEBP.`);
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError(`${label}: la imagen debe pesar menos de 10 MB.`);
      return false;
    }
    onError("");
    return true;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !displayName.trim()) return;
    setBusy(true);
    onError("");
    const newPaths: string[] = [];
    let profilePersisted = false;
    try {
      async function uploadProfileImage(file: File, imageType: "avatar" | "wallpaper"): Promise<string> {
        const path = `${duo.id}/${userId}/${imageType}-${crypto.randomUUID()}`;
        const { error: uploadError } = await supabase!.storage.from("duo-photos").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        newPaths.push(path);
        return path;
      }

      const avatarPath = avatarFile ? await uploadProfileImage(avatarFile, "avatar") : initialProfile?.avatar_path ?? null;
      const wallpaperPath = wallpaperFile ? await uploadProfileImage(wallpaperFile, "wallpaper") : initialProfile?.wallpaper_path ?? null;
      const avatarResult = avatarPath ? await supabase.storage.from("duo-photos").createSignedUrl(avatarPath, 60 * 60) : null;
      if (avatarResult?.error) throw avatarResult.error;
      const wallpaperResult = wallpaperPath ? await supabase.storage.from("duo-photos").createSignedUrl(wallpaperPath, 60 * 60) : null;
      if (wallpaperResult?.error) throw wallpaperResult.error;
      const { error: saveError } = await supabase.from("user_profiles").upsert({
        user_id: userId,
        duo_id: duo.id,
        display_name: displayName.trim(),
        avatar_path: avatarPath,
        wallpaper_path: wallpaperPath,
      }, { onConflict: "user_id" });
      if (saveError) throw saveError;
      profilePersisted = true;

      const oldPaths = [
        avatarFile ? initialProfile?.avatar_path : null,
        wallpaperFile ? initialProfile?.wallpaper_path : null,
      ].filter((path): path is string => Boolean(path));
      if (oldPaths.length) {
        const { error: cleanupError } = await supabase.storage.from("duo-photos").remove(oldPaths);
        if (cleanupError) onError(`El perfil se guardó, pero no se pudieron limpiar imágenes anteriores: ${cleanupError.message}`);
      }
      onSaved({
        display_name: displayName.trim(),
        avatar_path: avatarPath,
        wallpaper_path: wallpaperPath,
        avatarUrl: avatarResult?.data.signedUrl ?? "",
        wallpaperUrl: wallpaperResult?.data.signedUrl ?? "",
      });
    } catch (cause) {
      if (newPaths.length && !profilePersisted) {
        const { error: cleanupError } = await supabase.storage.from("duo-photos").remove(newPaths);
        if (cleanupError) onError(`${errorMessage(cause)}. No se pudieron limpiar las imágenes pendientes: ${cleanupError.message}`);
        else onError(errorMessage(cause));
      } else {
        onError(errorMessage(cause));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="upload-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="modal-heading">
          <div><div className="eyebrow">TU ESPACIO, A TU MANERA</div><h2 id="profile-title">Configurar mi perfil</h2></div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={19} /></button>
        </div>
        <form className="form-stack" onSubmit={(event) => void save(event)}>
          <label className="field-label" htmlFor="profile-name">¿Cómo quieres que te llamen?</label>
          <input className="plain-input" id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required />
          <div className="profile-image-fields">
            <label className="profile-image-control" htmlFor="avatar-file">
              {avatarPreview ? <img src={avatarPreview} alt="Vista previa de foto de perfil" /> : <span className="profile-placeholder"><Camera size={20} /></span>}
              <span><strong>Foto de perfil</strong><small>JPG, PNG o WEBP · 10 MB</small></span>
              <input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file && validateImage(file, "Foto de perfil")) setAvatarFile(file); }} />
            </label>
            <label className="profile-image-control wallpaper-control" htmlFor="wallpaper-file">
              {wallpaperPreview ? <img src={wallpaperPreview} alt="Vista previa de fondo" /> : <span className="profile-placeholder"><ImagePlus size={20} /></span>}
              <span><strong>Fondo de pantalla</strong><small>Personaliza tu portada · 10 MB</small></span>
              <input id="wallpaper-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file && validateImage(file, "Fondo de pantalla")) setWallpaperFile(file); }} />
            </label>
          </div>
          <button className="button button-primary auth-submit" type="submit" disabled={!displayName.trim() || busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
            {busy ? "Guardando perfil..." : "Guardar cambios"}
          </button>
        </form>
      </section>
    </div>
  );
}

function SetupScreen() {
  return (
    <main className="setup-screen">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>entre nosotras<span className="brand-period">.</span></span></a>
      </header>
      <section className="setup-card">
        <div className="setup-icon"><LockKeyhole size={22} /></div>
        <div className="eyebrow">UN ESPACIO PRIVADO PARA DOS</div>
        <h1>Su álbum está<br />casi <em>listo.</em></h1>
        <p>Conecta tu proyecto de Supabase para empezar a guardar y compartir recuerdos de forma privada.</p>
        <ol className="setup-steps">
          <li><span>1</span><div><strong>Ejecuta el esquema de base de datos</strong><small>Abre Supabase → SQL Editor y ejecuta <code>supabase/schema.sql</code>.</small></div></li>
          <li><span>2</span><div><strong>Configura las claves del proyecto</strong><small>Copia <code>.env.example</code> a <code>.env</code> y pega la URL y la clave anon de Supabase.</small></div></li>
          <li><span>3</span><div><strong>Inicia la aplicación</strong><small>En PowerShell, ejecuta <code>npm.cmd install</code> y luego <code>npm.cmd run dev</code>.</small></div></li>
        </ol>
        <div className="setup-note"><LockKeyhole size={15} /> No uses nunca la clave <code>service_role</code> en esta página.</div>
      </section>
    </main>
  );
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

export default App;
