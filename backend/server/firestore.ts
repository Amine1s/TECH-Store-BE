import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  Firestore
} from "firebase/firestore";
import fs from "fs";
import path from "path";

// Singleton Database instance for Serverless reuse
let dbInstance: Firestore | null = null;

// Helper to get configuration safely from Environment Variables or Config Files
function getFirebaseConfig() {
  // 1. Check if full JSON config string is passed via Environment Variable (Vercel standard)
  if (process.env.FIREBASE_CONFIG) {
    try {
      return JSON.parse(process.env.FIREBASE_CONFIG);
    } catch (e) {
      console.warn("Could not parse FIREBASE_CONFIG env var JSON:", e);
    }
  }

  // 2. Check if individual Environment Variables exist
  if (process.env.FIREBASE_PROJECT_ID) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
      firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
      appId: process.env.FIREBASE_APP_ID || ""
    };
  }

  // 3. Check for firebase-applet-config.json in workspace directories
const candidatePaths = [
    path.join(process.cwd(), "firebase-applet-config.json"),
    path.join(process.cwd(), "..", "firebase-applet-config.json")
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err) {
      // Continue searching
    }
  }

  // 4. Default Project Fallback
  return {
    projectId: "unique-diode-x6tp2",
    appId: "1:613282200427:web:8a5d512f2ac78245faea2e",
    apiKey: "AIzaSyDDuLTnCJKum7xQhYyLDS7posYk5mWXC0g",
    authDomain: "unique-diode-x6tp2.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-luxuryelectronic-9b205320-d69d-4896-853f-dba9e26cdb6e",
    storageBucket: "unique-diode-x6tp2.firebasestorage.app"
  };
}

export function getDb(): Firestore | null {
  if (dbInstance) return dbInstance;

  try {
    const config = getFirebaseConfig();
    const app = !getApps().length ? initializeApp(config) : getApp();
    const dbId = config.firestoreDatabaseId;
    dbInstance = (dbId && dbId !== "(default)") ? getFirestore(app, dbId) : getFirestore(app);
    console.log(" Serverless / Backend Firestore database connected successfully.");
    return dbInstance;
  } catch (err) {
    console.error(" Failed to initialize Backend Firestore:", err);
    return null;
  }
}

// Collections
const PRODUCTS_COL = "products";
const SETTINGS_COL = "settings";
const ORDERS_COL = "orders";

// 1. Fetch all products from server-side Firestore
export async function fetchProductsFromDb(fallbackProducts: any[]): Promise<any[]> {
  const db = getDb();
  if (!db) return fallbackProducts;

  try {
    const colRef = collection(db, PRODUCTS_COL);
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
      // Seed products from server to Firestore
      console.log("Seeding initial products to Firestore from Backend...");
      const batch = writeBatch(db);
      fallbackProducts.forEach((p) => {
        const docRef = doc(db, PRODUCTS_COL, p.id);
        batch.set(docRef, p);
      });
      await batch.commit();
      return fallbackProducts;
    }

    const prods: any[] = [];
    snapshot.forEach((d) => {
      prods.push(d.data());
    });
    return prods;
  } catch (err) {
    console.error("Error fetching products from Firestore in backend:", err);
    return fallbackProducts;
  }
}

// 2. Save product to Firestore from Backend
export async function saveProductToDb(product: any): Promise<boolean> {
  const db = getDb();
  if (!db || !product?.id) return false;

  try {
    const docRef = doc(db, PRODUCTS_COL, product.id);
    await setDoc(docRef, product, { merge: true });
    return true;
  } catch (err) {
    console.error("Error saving product to Firestore in backend:", err);
    return false;
  }
}

// 3. Delete product from Firestore in Backend
export async function deleteProductFromDb(productId: string): Promise<boolean> {
  const db = getDb();
  if (!db || !productId) return false;

  try {
    const docRef = doc(db, PRODUCTS_COL, productId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("Error deleting product from Firestore in backend:", err);
    return false;
  }
}

// 4. Get Hero Settings from Firestore in Backend
export async function fetchHeroSettingsFromDb(fallbackSettings: any): Promise<any> {
  const db = getDb();
  if (!db) return fallbackSettings;

  try {
    const docRef = doc(db, SETTINGS_COL, "hero");
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data();
    } else {
      await setDoc(docRef, fallbackSettings);
      return fallbackSettings;
    }
  } catch (err) {
    console.error("Error fetching hero settings in backend:", err);
    return fallbackSettings;
  }
}

// 5. Save Hero Settings to Firestore in Backend
export async function saveHeroSettingsToDb(settings: any): Promise<boolean> {
  const db = getDb();
  if (!db || !settings) return false;

  try {
    const docRef = doc(db, SETTINGS_COL, "hero");
    await setDoc(docRef, settings, { merge: true });
    return true;
  } catch (err) {
    console.error("Error saving hero settings in backend:", err);
    return false;
  }
}

// 6. Fetch orders from Firestore in Backend
export async function fetchOrdersFromDb(fallbackOrders: any[]): Promise<any[]> {
  const db = getDb();
  if (!db) return fallbackOrders;

  try {
    const colRef = collection(db, ORDERS_COL);
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return fallbackOrders;
    }

    const list: any[] = [];
    snapshot.forEach((d) => {
      list.push(d.data());
    });
    return list;
  } catch (err) {
    console.warn("Fallback fetching orders without order query in backend:", err);
    try {
      const colRef = collection(db, ORDERS_COL);
      const snapshot = await getDocs(colRef);
      const list: any[] = [];
      snapshot.forEach((d) => {
        list.push(d.data());
      });
      return list.length > 0 ? list : fallbackOrders;
    } catch (e2) {
      return fallbackOrders;
    }
  }
}

// 7. Save Order to Firestore in Backend
export async function saveOrderToDb(order: any): Promise<boolean> {
  const db = getDb();
  if (!db || !order?.id) return false;

  try {
    const docRef = doc(db, ORDERS_COL, order.id);
    await setDoc(docRef, order, { merge: true });
    return true;
  } catch (err) {
    console.error("Error saving order to Firestore in backend:", err);
    return false;
  }
}

// 8. Update Order in Firestore in Backend
export async function updateOrderInDb(orderId: string, updates: any): Promise<boolean> {
  const db = getDb();
  if (!db || !orderId) return false;

  try {
    const docRef = doc(db, ORDERS_COL, orderId);
    await setDoc(docRef, updates, { merge: true });
    return true;
  } catch (err) {
    console.error("Error updating order in Firestore in backend:", err);
    return false;
  }
}
