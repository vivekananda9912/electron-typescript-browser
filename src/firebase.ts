import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  where,
  serverTimestamp,
  query,
  orderBy,
  limit,
  Firestore
} from "firebase/firestore";
import * as dotenv from "dotenv";

dotenv.config();

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let currentConfig: FirebaseConfig | null = null;

export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyAYlezFn0tSSQHA-vRnJeBfJ-Om1YlDghk",
  authDomain: "eschool-dev-4c6b4.firebaseapp.com",
  projectId: "eschool-dev-4c6b4",
  storageBucket: "eschool-dev-4c6b4.firebasestorage.app",
  messagingSenderId: "875648503944",
  appId: "1:875648503944:web:6e344d9feec53a4a6f0f3d"
};

export function getEnvFirebaseConfig(): FirebaseConfig {
  const apiKey = process.env.FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey;
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain;
  const projectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket;
  const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId;
  const appId = process.env.FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

export function initializeFirebase(config?: FirebaseConfig): { success: boolean; message: string } {
  try {
    const targetConfig = config || getEnvFirebaseConfig();
    if (!targetConfig || !targetConfig.apiKey || !targetConfig.projectId) {
      return {
        success: false,
        message: "Firebase configuration missing. Please provide apiKey and projectId.",
      };
    }

    if (getApps().length > 0) {
      app = getApp();
    } else {
      app = initializeApp(targetConfig);
    }

    db = getFirestore(app);
    currentConfig = targetConfig;
    console.log("✅ Firebase initialized successfully for project:", targetConfig.projectId);
    return {
      success: true,
      message: `Firebase initialized successfully for project: ${targetConfig.projectId}`,
    };
  } catch (error: any) {
    console.error("❌ Failed to initialize Firebase:", error);
    return {
      success: false,
      message: error?.message || "Failed to initialize Firebase.",
    };
  }
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    const initResult = initializeFirebase();
    if (!initResult.success || !db) {
      throw new Error("Firestore database is not initialized. Please configure Firebase settings first.");
    }
  }
  return db;
}

export function getFirebaseConfigStatus() {
  return {
    isInitialized: db !== null,
    projectId: currentConfig?.projectId || process.env.FIREBASE_PROJECT_ID || null,
    hasApiKey: Boolean(currentConfig?.apiKey || process.env.FIREBASE_API_KEY),
  };
}

export async function testFirestoreConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const database = getFirestoreDb();
    const testCol = collection(database, "_connection_test");
    const testDoc = await addDoc(testCol, {
      timestamp: serverTimestamp(),
      testMessage: "Firebase Firestore connection verified from Electron app",
      clientTime: new Date().toISOString(),
    });

    return {
      success: true,
      message: `Successfully connected to Firestore! Document created with ID: ${testDoc.id}`,
      details: { docId: testDoc.id },
    };
  } catch (error: any) {
    console.error("❌ Firestore connection test failed:", error);
    return {
      success: false,
      message: error?.message || "Failed to connect to Firestore.",
    };
  }
}

export async function addFirestoreDocument(collectionName: string, data: Record<string, any>): Promise<{ success: boolean; id?: string; message: string }> {
  try {
    const database = getFirestoreDb();
    const colRef = collection(database, collectionName);
    const docRef = await addDoc(colRef, {
      ...data,
      createdAt: serverTimestamp(),
    });
    return {
      success: true,
      id: docRef.id,
      message: `Document added to collection '${collectionName}' with ID: ${docRef.id}`,
    };
  } catch (error: any) {
    console.error(`❌ Error adding document to '${collectionName}':`, error);
    return {
      success: false,
      message: error?.message || `Failed to add document to ${collectionName}.`,
    };
  }
}

export async function getFirestoreDocuments(collectionName: string, maxItems: number = 20): Promise<{ success: boolean; data?: any[]; message: string }> {
  try {
    const database = getFirestoreDb();
    const colRef = collection(database, collectionName);
    const q = query(colRef, limit(maxItems));
    const querySnapshot = await getDocs(q);

    const documents: any[] = [];
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
  } catch (error: any) {
    console.error(`❌ Error fetching documents from '${collectionName}':`, error);
    return {
      success: false,
      message: error?.message || `Failed to fetch documents from ${collectionName}.`,
    };
  }
}

export const DEFAULT_WHITELISTED_WEBSITES = [
  "https://www.wikipedia.org",
  "https://www.khanacademy.org",
  "https://www.w3schools.com",
  "https://docs.google.com",
  "https://www.geogebra.org",
  "https://stackoverflow.com",
  "https://quizlet.com"
];

export async function createSampleClassCode(
  classCode: string, 
  className: string = "Standard Class",
  whitelistedWebsites: string[] = DEFAULT_WHITELISTED_WEBSITES
): Promise<{ success: boolean; message: string }> {
  try {
    const database = getFirestoreDb();
    const cleanCode = classCode.trim().toUpperCase();
    const classDocRef = doc(database, "classes", cleanCode);

    await setDoc(classDocRef, {
      code: cleanCode,
      name: className,
      wishlist: whitelistedWebsites,
      whitelistedWebsites,
      createdAt: serverTimestamp(),
      active: true
    }, { merge: true });

    return {
      success: true,
      message: `Class code '${cleanCode}' created successfully in Firestore!`,
    };
  } catch (error: any) {
    console.error(`❌ Error creating class code '${classCode}':`, error);
    return {
      success: false,
      message: error?.message || `Failed to create class code in Firestore.`,
    };
  }
}

export async function verifyClassCode(classCode: string): Promise<{ success: boolean; found: boolean; classData?: any; message: string }> {
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
    const classDocRef = doc(database, "classes", cleanCode);
    const classDocSnap = await getDoc(classDocRef);

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
    const classesCol = collection(database, "classes");
    const qCode = query(classesCol, where("code", "==", cleanCode));
    const qSnap = await getDocs(qCode);

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
  } catch (error: any) {
    console.error("❌ Error verifying class code in Firestore:", error);
    return {
      success: false,
      found: false,
      message: error?.message || "Failed to query Firebase for class code verification.",
    };
  }
}

export async function ensureDefaultFirebaseClasses(): Promise<void> {
  try {
    const sampleClasses = [
      { code: "EDU101", name: "Computer Science EDU101" },
      { code: "DEMO123", name: "Demonstration Class DEMO123" },
      { code: "CSE1263", name: "Computer Engineering CSE1263" }
    ];

    for (const item of sampleClasses) {
      await createSampleClassCode(item.code, item.name, DEFAULT_WHITELISTED_WEBSITES);
    }
    console.log("✅ Initial Firebase class codes verified/seeded in Firestore.");
  } catch (err) {
    console.warn("ℹ️ Firebase class auto-seed notice:", err);
  }
}
