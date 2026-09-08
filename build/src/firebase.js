"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WHITELISTED_WEBSITES = exports.DEFAULT_FIREBASE_CONFIG = void 0;
exports.getEnvFirebaseConfig = getEnvFirebaseConfig;
exports.initializeFirebase = initializeFirebase;
exports.getFirestoreDb = getFirestoreDb;
exports.getFirebaseConfigStatus = getFirebaseConfigStatus;
exports.testFirestoreConnection = testFirestoreConnection;
exports.addFirestoreDocument = addFirestoreDocument;
exports.getFirestoreDocuments = getFirestoreDocuments;
exports.createSampleClassCode = createSampleClassCode;
exports.verifyClassCode = verifyClassCode;
exports.ensureDefaultFirebaseClasses = ensureDefaultFirebaseClasses;
const app_1 = require("firebase/app");
const firestore_1 = require("firebase/firestore");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
let app = null;
let db = null;
let currentConfig = null;
exports.DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAYlezFn0tSSQHA-vRnJeBfJ-Om1YlDghk",
    authDomain: "eschool-dev-4c6b4.firebaseapp.com",
    projectId: "eschool-dev-4c6b4",
    storageBucket: "eschool-dev-4c6b4.firebasestorage.app",
    messagingSenderId: "875648503944",
    appId: "1:875648503944:web:6e344d9feec53a4a6f0f3d"
};
function getEnvFirebaseConfig() {
    const apiKey = process.env.FIREBASE_API_KEY || exports.DEFAULT_FIREBASE_CONFIG.apiKey;
    const authDomain = process.env.FIREBASE_AUTH_DOMAIN || exports.DEFAULT_FIREBASE_CONFIG.authDomain;
    const projectId = process.env.FIREBASE_PROJECT_ID || exports.DEFAULT_FIREBASE_CONFIG.projectId;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || exports.DEFAULT_FIREBASE_CONFIG.storageBucket;
    const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || exports.DEFAULT_FIREBASE_CONFIG.messagingSenderId;
    const appId = process.env.FIREBASE_APP_ID || exports.DEFAULT_FIREBASE_CONFIG.appId;
    return {
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId,
        appId,
    };
}
function initializeFirebase(config) {
    try {
        const targetConfig = config || getEnvFirebaseConfig();
        if (!targetConfig || !targetConfig.apiKey || !targetConfig.projectId) {
            return {
                success: false,
                message: "Firebase configuration missing. Please provide apiKey and projectId.",
            };
        }
        if ((0, app_1.getApps)().length > 0) {
            app = (0, app_1.getApp)();
        }
        else {
            app = (0, app_1.initializeApp)(targetConfig);
        }
        db = (0, firestore_1.getFirestore)(app);
        currentConfig = targetConfig;
        console.log("✅ Firebase initialized successfully for project:", targetConfig.projectId);
        return {
            success: true,
            message: `Firebase initialized successfully for project: ${targetConfig.projectId}`,
        };
    }
    catch (error) {
        console.error("❌ Failed to initialize Firebase:", error);
        return {
            success: false,
            message: error?.message || "Failed to initialize Firebase.",
        };
    }
}
function getFirestoreDb() {
    if (!db) {
        const initResult = initializeFirebase();
        if (!initResult.success || !db) {
            throw new Error("Firestore database is not initialized. Please configure Firebase settings first.");
        }
    }
    return db;
}
function getFirebaseConfigStatus() {
    return {
        isInitialized: db !== null,
        projectId: currentConfig?.projectId || process.env.FIREBASE_PROJECT_ID || null,
        hasApiKey: Boolean(currentConfig?.apiKey || process.env.FIREBASE_API_KEY),
    };
}
async function testFirestoreConnection() {
    try {
        const database = getFirestoreDb();
        const testCol = (0, firestore_1.collection)(database, "_connection_test");
        const testDoc = await (0, firestore_1.addDoc)(testCol, {
            timestamp: (0, firestore_1.serverTimestamp)(),
            testMessage: "Firebase Firestore connection verified from Electron app",
            clientTime: new Date().toISOString(),
        });
        return {
            success: true,
            message: `Successfully connected to Firestore! Document created with ID: ${testDoc.id}`,
            details: { docId: testDoc.id },
        };
    }
    catch (error) {
        console.error("❌ Firestore connection test failed:", error);
        return {
            success: false,
            message: error?.message || "Failed to connect to Firestore.",
        };
    }
}
async function addFirestoreDocument(collectionName, data) {
    try {
        const database = getFirestoreDb();
        const colRef = (0, firestore_1.collection)(database, collectionName);
        const docRef = await (0, firestore_1.addDoc)(colRef, {
            ...data,
            createdAt: (0, firestore_1.serverTimestamp)(),
        });
        return {
            success: true,
            id: docRef.id,
            message: `Document added to collection '${collectionName}' with ID: ${docRef.id}`,
        };
    }
    catch (error) {
        console.error(`❌ Error adding document to '${collectionName}':`, error);
        return {
            success: false,
            message: error?.message || `Failed to add document to ${collectionName}.`,
        };
    }
}
async function getFirestoreDocuments(collectionName, maxItems = 20) {
    try {
        const database = getFirestoreDb();
        const colRef = (0, firestore_1.collection)(database, collectionName);
        const q = (0, firestore_1.query)(colRef, (0, firestore_1.limit)(maxItems));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        const documents = [];
        querySnapshot.forEach((doc) => {
            documents.push({
                id: doc.id,
                ...doc.data(),
            });
        });
        return {
            success: true,
            data: documents,
            message: `Fetched ${documents.length} document(s) from collection '${collectionName}'`,
        };
    }
    catch (error) {
        console.error(`❌ Error fetching documents from '${collectionName}':`, error);
        return {
            success: false,
            message: error?.message || `Failed to fetch documents from ${collectionName}.`,
        };
    }
}
exports.DEFAULT_WHITELISTED_WEBSITES = [
    "https://www.wikipedia.org",
    "https://www.khanacademy.org",
    "https://www.w3schools.com",
    "https://docs.google.com",
    "https://www.geogebra.org",
    "https://stackoverflow.com",
    "https://quizlet.com"
];
async function createSampleClassCode(classCode, className = "Standard Class", whitelistedWebsites = exports.DEFAULT_WHITELISTED_WEBSITES) {
    try {
        const database = getFirestoreDb();
        const cleanCode = classCode.trim().toUpperCase();
        const classDocRef = (0, firestore_1.doc)(database, "classes", cleanCode);
        await (0, firestore_1.setDoc)(classDocRef, {
            code: cleanCode,
            name: className,
            wishlist: whitelistedWebsites,
            whitelistedWebsites,
            createdAt: (0, firestore_1.serverTimestamp)(),
            active: true
        }, { merge: true });
        return {
            success: true,
            message: `Class code '${cleanCode}' created successfully in Firestore!`,
        };
    }
    catch (error) {
        console.error(`❌ Error creating class code '${classCode}':`, error);
        return {
            success: false,
            message: error?.message || `Failed to create class code in Firestore.`,
        };
    }
}
async function verifyClassCode(classCode) {
    try {
        const database = getFirestoreDb();
        const cleanCode = classCode.trim().toUpperCase();
        if (!cleanCode) {
            return {
                success: false,
                found: false,
                message: "Please enter a valid Class Code.",
            };
        }
        // 1. Check if document exists in Firestore with ID = cleanCode
        const classDocRef = (0, firestore_1.doc)(database, "classes", cleanCode);
        const classDocSnap = await (0, firestore_1.getDoc)(classDocRef);
        if (classDocSnap.exists()) {
            const data = classDocSnap.data();
            const websites = data.wishlist || data.wishList || data.whitelistedWebsites || data.allowedWebsites || data.whitelist || data.whitelisted_urls || [];
            return {
                success: true,
                found: true,
                classData: { id: classDocSnap.id, ...data, whitelistedWebsites: websites },
                message: `✅ Access Granted! Verified Class Code '${cleanCode}' in Firebase.`,
            };
        }
        // 2. Query Firestore by code field
        const classesCol = (0, firestore_1.collection)(database, "classes");
        const qCode = (0, firestore_1.query)(classesCol, (0, firestore_1.where)("code", "==", cleanCode));
        const qSnap = await (0, firestore_1.getDocs)(qCode);
        if (!qSnap.empty) {
            const matchedDoc = qSnap.docs[0];
            const data = matchedDoc.data();
            const websites = data.wishlist || data.wishList || data.whitelistedWebsites || data.allowedWebsites || data.whitelist || data.whitelisted_urls || [];
            return {
                success: true,
                found: true,
                classData: { id: matchedDoc.id, ...data, whitelistedWebsites: websites },
                message: `✅ Access Granted! Verified Class Code '${cleanCode}' in Firebase.`,
            };
        }
        // 3. Strict Denial: Code does NOT exist in Firebase Firestore
        return {
            success: true,
            found: false,
            message: `❌ Access Denied! Class Code '${cleanCode}' is NOT present in Firebase. Please enter a registered Class Code.`,
        };
    }
    catch (error) {
        console.error("❌ Error verifying class code in Firestore:", error);
        return {
            success: false,
            found: false,
            message: error?.message || "Failed to query Firebase for class code verification.",
        };
    }
}
async function ensureDefaultFirebaseClasses() {
    try {
        const sampleClasses = [
            { code: "EDU101", name: "Computer Science EDU101" },
            { code: "DEMO123", name: "Demonstration Class DEMO123" },
            { code: "CSE1263", name: "Computer Engineering CSE1263" }
        ];
        for (const item of sampleClasses) {
            await createSampleClassCode(item.code, item.name, exports.DEFAULT_WHITELISTED_WEBSITES);
        }
        console.log("✅ Initial Firebase class codes verified/seeded in Firestore.");
    }
    catch (err) {
        console.warn("ℹ️ Firebase class auto-seed notice:", err);
    }
}
