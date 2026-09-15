import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import fs from "fs/promises";
import { cert, getApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

let systemStateRef: DocumentReference;

async function connectFirestore() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    || path.resolve("firebase-service-account.json");
  const databaseId = process.env.FIRESTORE_DATABASE_ID
    || "ai-studio-firebasewebconne-406b2eda-33ca-423e-a834-0df2d089be59";
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || await fs.readFile(serviceAccountPath, "utf-8");
  const serviceAccount = JSON.parse(serviceAccountJson);
  const firebaseApp = getApps()[0] || initializeAdminApp({ credential: cert(serviceAccount) });
  systemStateRef = getFirestore(firebaseApp, databaseId).doc("taekwondo/system");
}

type PasswordKey = "1" | "2" | "3" | "jury";
type Passwords = Record<PasswordKey, string>;
type PasswordHashes = Record<PasswordKey, { salt: string, hash: string }>;
type Winner = "red" | "blue";
type Round = { id: number, winner: Winner, timestamp: string, votes: Record<string, string | null> };
type Match = { id: number, title: string, redTeam: string, blueTeam: string, rounds: Round[] };
type Database = {
  messages: any[],
  rounds: Round[],
  matches?: Match[],
  referees?: Record<string, string>,
  settings?: { roundDuration: number },
  passwords?: Passwords,
  passwordHashes?: PasswordHashes,
};

const scrypt = promisify(scryptCallback);
const passwordKeys: PasswordKey[] = ["1", "2", "3", "jury"];

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64) as Buffer).toString("hex");
  return { salt, hash };
}

async function hashPasswords(passwords: Passwords): Promise<PasswordHashes> {
  const entries = await Promise.all(passwordKeys.map(async (key) => [key, await hashPassword(passwords[key])] as const));
  return Object.fromEntries(entries) as PasswordHashes;
}

async function passwordMatches(password: unknown, stored?: { salt: string, hash: string }) {
  if (typeof password !== "string" || !stored) return false;
  const suppliedHash = await scrypt(password, stored.salt, 64) as Buffer;
  const storedHash = Buffer.from(stored.hash, "hex");
  return suppliedHash.length === storedHash.length && timingSafeEqual(suppliedHash, storedHash);
}

async function startServer() {
  await connectFirestore();
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Firebase is the persistent store. The local JSON file is read only once for migration.
  const dbPath = './database.json';
  let db: Database = { messages: [], rounds: [] };
  let shouldSaveMigratedCredentials = false;
  let shouldDeleteLocalDatabase = false;
  
  try {
    const cloudSnapshot = await systemStateRef.get();
    if (cloudSnapshot.exists) {
      db = cloudSnapshot.data() as Database;
      shouldDeleteLocalDatabase = true;
    } else {
      const data = await fs.readFile(dbPath, 'utf-8');
      db = JSON.parse(data) as Database;
      shouldSaveMigratedCredentials = true;
      shouldDeleteLocalDatabase = true;
    }
    if (!db.referees) {
      db.referees = { "1": "علي", "2": "حسين", "3": "عباس" };
    }
    if (!db.settings) {
      db.settings = { roundDuration: 0 };
    }
    if (db.passwords && !db.passwordHashes) {
      db.passwordHashes = await hashPasswords(db.passwords);
      delete db.passwords;
      shouldSaveMigratedCredentials = true;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      db.referees = { "1": "علي", "2": "حسين", "3": "عباس" };
      db.settings = { roundDuration: 0 };
      shouldSaveMigratedCredentials = true;
    } else {
      throw err;
    }
  }

  if (!db.passwordHashes) {
    const initialPasswords: Passwords = {
      "1": process.env.INITIAL_REFEREE_1_PASSWORD || "",
      "2": process.env.INITIAL_REFEREE_2_PASSWORD || "",
      "3": process.env.INITIAL_REFEREE_3_PASSWORD || "",
      jury: process.env.INITIAL_JURY_PASSWORD || "",
    };

    if (passwordKeys.some((key) => initialPasswords[key].trim().length === 0)) {
      throw new Error("للتشغيل الأول، عيّن رموز الحكام ولجنة التحكيم في ملف .env.local.");
    }

    if (new Set([initialPasswords["1"], initialPasswords["2"], initialPasswords["3"]]).size !== 3) {
      throw new Error("للتشغيل الأول، يجب أن تكون رموز الحكام الثلاثة مختلفة.");
    }

    db.passwordHashes = await hashPasswords(initialPasswords);
    shouldSaveMigratedCredentials = true;
  }

  if (!db.matches) {
    db.matches = Array.from({ length: Math.ceil(db.rounds.length / 3) }, (_, index) => ({
      id: index + 1,
      title: `النزال رقم ${index + 1}`,
      redTeam: "الفريق الأحمر",
      blueTeam: "الفريق الأزرق",
      rounds: db.rounds.slice(index * 3, index * 3 + 3),
    }));
    shouldSaveMigratedCredentials = true;
  }

  const saveDb = async () => {
    await systemStateRef.set(db);
  };

  if (shouldSaveMigratedCredentials) await saveDb();
  if (shouldDeleteLocalDatabase) await fs.unlink(dbPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });

  let refereesConfig: Record<string, { name: string, socketId: string | null }> = {
    "1": { name: db.referees!["1"] || "الحكم الأول", socketId: null },
    "2": { name: db.referees!["2"] || "الحكم الثاني", socketId: null },
    "3": { name: db.referees!["3"] || "الحكم الثالث", socketId: null }
  };

  // Create HTTP server needed for Socket.io
  const httpServer = createHttpServer(app);

  // Initialize Socket.io server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // State for the current round
  let currentVotes: Record<string, string | null> = { "1": null, "2": null, "3": null };
  let roundWinner: string | null = null;
  let resetTimerInterval: NodeJS.Timeout | null = null;
  let activeRoundTimerInterval: NodeJS.Timeout | null = null;
  const authenticatedJurySockets = new Set<string>();

  const emitHistoryToAuthenticatedJury = () => {
    authenticatedJurySockets.forEach((socketId) => {
      io.sockets.sockets.get(socketId)?.emit("update_history", db.rounds);
    });
  };

  const emitMatchesToAuthenticatedJury = () => {
    authenticatedJurySockets.forEach((socketId) => {
      io.sockets.sockets.get(socketId)?.emit("update_matches", db.matches);
    });
  };

  const publicDisplayState = () => {
    const currentMatch = db.matches?.at(-1);
    return currentMatch
      ? { id: currentMatch.id, title: currentMatch.title, redTeam: currentMatch.redTeam, blueTeam: currentMatch.blueTeam, rounds: currentMatch.rounds.map(({ id, winner, timestamp }) => ({ id, winner, timestamp })) }
      : { id: 1, title: "النزال رقم 1", redTeam: "الفريق الأحمر", blueTeam: "الفريق الأزرق", rounds: [] };
  };

  const emitDisplayState = () => io.emit("update_display", publicDisplayState());

  const startActiveRoundTimer = () => {
    if (activeRoundTimerInterval) clearInterval(activeRoundTimerInterval);
    const duration = db.settings?.roundDuration || 0;
    if (duration > 0) {
      let timeLeft = duration;
      io.emit("round_timer_tick", { secondsLeft: timeLeft });
      activeRoundTimerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft >= 0) {
          io.emit("round_timer_tick", { secondsLeft: timeLeft });
        } else {
          clearInterval(activeRoundTimerInterval!);
          activeRoundTimerInterval = null;
        }
      }, 1000);
    } else {
      io.emit("round_timer_tick", { secondsLeft: null });
    }
  };

  // Socket.io connection logic
  io.on("connection", async (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);
    
    // Send current state to newly connected clients
    socket.emit("update_referees", refereesConfig);
    socket.emit("update_settings", db.settings);
    socket.emit("update_votes", currentVotes);
    if (roundWinner) {
      socket.emit("round_result", { winner: roundWinner });
    }
    socket.emit("update_display", publicDisplayState());
    
    // Send chat history
    try {
      const chatHistory = db.messages.slice(-50);
      chatHistory.forEach(msg => {
        socket.emit("receive_message", msg);
      });
    } catch (err) {
      console.error("[Database] Error fetching history:", err);
    }

    socket.on("submit_vote", async (payload) => {
      const { refereeId, color } = payload || {};

      if (!refereesConfig[refereeId] || refereesConfig[refereeId].socketId !== socket.id) {
        socket.emit("vote_error", "لا يمكنك التصويت إلا من دور الحكم الذي سجلت دخوله");
        return;
      }

      if (color !== "red" && color !== "blue") {
        socket.emit("vote_error", "لون التصويت غير صالح");
        return;
      }

      if (currentVotes[refereeId] || roundWinner) {
        socket.emit("vote_error", "تم تسجيل تصويت هذا الحكم لهذه الجولة");
        return;
      }

      console.log(`[Socket.io] Received vote from referee ${refereeId}`);
      
      // Update the vote state
      currentVotes[refereeId] = color;
      io.emit("update_votes", currentVotes);

      // Check for majority (2 or more votes)
      let redCount = 0;
      let blueCount = 0;
      
      Object.values(currentVotes).forEach(vote => {
        if (vote === 'red') redCount++;
        if (vote === 'blue') blueCount++;
      });

      let startResetCountdown = false;

      if (redCount >= 2 && roundWinner !== 'red') {
        roundWinner = 'red';
        io.emit("round_result", { winner: 'red' });
        console.log("[Socket.io] Round Result: RED WINS");
        startResetCountdown = true;
        const recordedRound: Round = { id: db.rounds.length + 1, winner: 'red', timestamp: new Date().toISOString(), votes: { ...currentVotes } };
        db.rounds.push(recordedRound);
        let activeMatch = db.matches!.at(-1);
        if (!activeMatch || activeMatch.rounds.length === 3) {
          activeMatch = { id: db.matches!.length + 1, title: `النزال رقم ${db.matches!.length + 1}`, redTeam: "الفريق الأحمر", blueTeam: "الفريق الأزرق", rounds: [] };
          db.matches!.push(activeMatch);
        }
        activeMatch.rounds.push(recordedRound);
        saveDb();
        emitHistoryToAuthenticatedJury();
        emitMatchesToAuthenticatedJury();
        emitDisplayState();
      } else if (blueCount >= 2 && roundWinner !== 'blue') {
        roundWinner = 'blue';
        io.emit("round_result", { winner: 'blue' });
        console.log("[Socket.io] Round Result: BLUE WINS");
        startResetCountdown = true;
        const recordedRound: Round = { id: db.rounds.length + 1, winner: 'blue', timestamp: new Date().toISOString(), votes: { ...currentVotes } };
        db.rounds.push(recordedRound);
        let activeMatch = db.matches!.at(-1);
        if (!activeMatch || activeMatch.rounds.length === 3) {
          activeMatch = { id: db.matches!.length + 1, title: `النزال رقم ${db.matches!.length + 1}`, redTeam: "الفريق الأحمر", blueTeam: "الفريق الأزرق", rounds: [] };
          db.matches!.push(activeMatch);
        }
        activeMatch.rounds.push(recordedRound);
        saveDb();
        emitHistoryToAuthenticatedJury();
        emitMatchesToAuthenticatedJury();
        emitDisplayState();
      }

      if (startResetCountdown) {
        if (resetTimerInterval) clearInterval(resetTimerInterval);
        let timeLeft = 30;
        io.emit("timer_tick", { secondsLeft: timeLeft });
        resetTimerInterval = setInterval(() => {
          timeLeft--;
          if (timeLeft > 0) {
            io.emit("timer_tick", { secondsLeft: timeLeft });
          } else {
            clearInterval(resetTimerInterval!);
            resetTimerInterval = null;
            currentVotes = { "1": null, "2": null, "3": null };
            roundWinner = null;
            io.emit("update_votes", currentVotes);
            io.emit("round_reset");
            startActiveRoundTimer();
            console.log("[Socket.io] Automatic reset triggered");
          }
        }, 1000);
      }
    });

    socket.on("trigger_reset", (callback?: (response: { success: boolean, message?: string }) => void) => {
      if (!authenticatedJurySockets.has(socket.id)) {
        callback?.({ success: false, message: "يجب تسجيل دخول لجنة التحكيم أولاً" });
        return;
      }
      console.log(`[Socket.io] Manual reset triggered`);
      if (resetTimerInterval) {
        clearInterval(resetTimerInterval);
        resetTimerInterval = null;
      }
      currentVotes = { "1": null, "2": null, "3": null };
      roundWinner = null;
      io.emit("update_votes", currentVotes);
      io.emit("round_reset");
      startActiveRoundTimer();
      callback?.({ success: true });
    });

    socket.on("send_message", async (payload) => {
      console.log(`[Socket.io] Chat message from ${payload.sender}: ${payload.text}`);
      try {
        db.messages.push(payload);
        saveDb();
      } catch (err) {
        console.error("[Database] Error saving message:", err);
      }
      io.emit("receive_message", payload);
    });

    socket.on("set_settings", async (payload: { names?: Record<string, string>, roundDuration?: number, passwords?: Passwords }, callback?: (response: { success: boolean, message?: string }) => void) => {
      if (!authenticatedJurySockets.has(socket.id)) {
        callback?.({ success: false, message: "يجب تسجيل دخول لجنة التحكيم أولاً" });
        return;
      }

      if (payload.names) {
        Object.keys(payload.names).forEach(id => {
          if (refereesConfig[id]) {
            refereesConfig[id].name = payload.names![id];
            if (db.referees) db.referees[id] = payload.names![id];
          }
        });
      }
      if (payload.roundDuration !== undefined) {
        if (!db.settings) db.settings = { roundDuration: 0 };
        db.settings.roundDuration = payload.roundDuration;
      }
      if (payload.passwords) {
        const passwords = payload.passwords;
        const requiredPasswords = [passwords["1"], passwords["2"], passwords["3"], passwords.jury];
        const allPasswordsPresent = requiredPasswords.every((password) => typeof password === "string" && password.trim().length > 0);
        const refereePasswords = [passwords["1"], passwords["2"], passwords["3"]];

        if (!allPasswordsPresent) {
          callback?.({ success: false, message: "يجب إدخال رمز لكل حكم ولجنة التحكيم" });
          return;
        }

        if (new Set(refereePasswords.map((password) => password.trim())).size !== 3) {
          callback?.({ success: false, message: "يجب أن يكون لكل حكم رمز مختلف" });
          return;
        }

        db.passwordHashes = await hashPasswords({
          "1": passwords["1"].trim(),
          "2": passwords["2"].trim(),
          "3": passwords["3"].trim(),
          jury: passwords.jury.trim(),
        });
      }
      saveDb();
      io.emit("update_referees", refereesConfig);
      io.emit("update_settings", db.settings);
      callback?.({ success: true });
    });

    socket.on("update_match_metadata", (payload: { id: number, title: string, redTeam: string, blueTeam: string }, callback?: (response: { success: boolean, message?: string }) => void) => {
      if (!authenticatedJurySockets.has(socket.id)) {
        callback?.({ success: false, message: "يجب تسجيل دخول لجنة التحكيم أولاً" });
        return;
      }
      const match = db.matches?.find((item) => item.id === payload.id);
      const title = payload.title?.trim();
      const redTeam = payload.redTeam?.trim();
      const blueTeam = payload.blueTeam?.trim();
      if (!match || !title || !redTeam || !blueTeam) {
        callback?.({ success: false, message: "أدخل اسم النزال والفريقين" });
        return;
      }
      match.title = title;
      match.redTeam = redTeam;
      match.blueTeam = blueTeam;
      saveDb();
      emitMatchesToAuthenticatedJury();
      emitDisplayState();
      callback?.({ success: true });
    });

    socket.on("authenticate_jury", async (password, callback) => {
      if (await passwordMatches(password, db.passwordHashes?.jury)) {
        authenticatedJurySockets.add(socket.id);
        socket.emit("update_history", db.rounds);
        socket.emit("update_matches", db.matches);
        callback({ success: true });
      } else {
        callback({ success: false });
      }
    });

    socket.on("claim_referee", async (payload) => {
      const { id, password } = payload;

      if (!refereesConfig[id]) {
        socket.emit("claim_error", "الحكم غير موجود");
        return;
      }

      if (refereesConfig[id].socketId) {
        socket.emit("claim_error", "هذا الحكم متصل حالياً");
        return;
      }
      
      if (!(await passwordMatches(password, db.passwordHashes?.[id as "1" | "2" | "3"]))) {
        socket.emit("claim_error", "رمز المرور غير صحيح");
        return;
      }
      
      if (refereesConfig[id] && !refereesConfig[id].socketId) {
        refereesConfig[id].socketId = socket.id;
        io.emit("update_referees", refereesConfig);
        socket.emit("claim_success", id);
      } else {
        socket.emit("claim_error", "هذا الاسم محجوز حالياً");
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      authenticatedJurySockets.delete(socket.id);
      let refsChanged = false;
      for (const id in refereesConfig) {
        if (refereesConfig[id].socketId === socket.id) {
          refereesConfig[id].socketId = null;
          refsChanged = true;
        }
      }
      if (refsChanged) io.emit("update_referees", refereesConfig);
    });
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Use httpServer.listen instead of app.listen to bind both Express and Socket.io
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
