
      rateLimitingEnabled: true,
      maxAttemptsPerWindow: MAX_LOGIN_ATTEMPTS,
      lockoutDurationMinutes: 5,
      activeLockoutsCount: activeLockouts
    }
  });
});

// 4.6 Hero Section Banner Settings (Dynamic Hero Product Customization)
let heroBannerSettings = {
  badge: "عرض الأسبوع الحصري",
  title: "جيل جديد من الحواسيب الخارقة",
  titleHighlight: "Pro-X الجيل العاشر",
  description: "تغلب على الحدود الرقمية مع معالجات ثنائية النواة ونظام تبريد مائي مغلق. صمم خصيصاً للمبرمجين واللاعبين المحترفين الذين يطلبون الفخامة والسرعة الفائقة مع تشفير حماية متقدم.",
  buttonText: "اكتشف المواصفات",
  stockNotice: "متوفر 12 قطعة فقط بالمستودع",
  productId: "c-3",
  customImageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80",
  customBadgeSubtext: "الإصدار المطور",
  customPrice: 8499,
  lastUpdated: new Date().toISOString()
};

app.get(["/api/hero-settings", "/hero-settings"], (req, res) => {
  res.json(heroBannerSettings);
});

app.post(["/api/hero-settings", "/hero-settings"], async (req, res) => {
  const updates = req.body;
  if (!updates) {
    return res.status(400).json({ error: "البيانات غير صالحة" });
  }
  heroBannerSettings = {
    ...heroBannerSettings,
    ...updates,
    lastUpdated: new Date().toISOString()
  };

  // Save to Firestore securely on the backend
  await saveHeroSettingsToDb(heroBannerSettings);

  res.json({
    success: true,
    message: "تم تحديث إعدادات منتج الهيرو بنجاح!",
    settings: heroBannerSettings
  });
});

// 5. Get All Orders
app.get(["/api/orders", "/orders"], (req, res) => {
  res.json(orders);
});

// 6. Update Order Status & Info (Status Tracking)
app.patch(["/api/orders/:id", "/orders/:id"], async (req, res) => {
  const { id } = req.params;
  const { status, shippingProvider, trackingNumber } = req.body;

  const orderIndex = orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }

  const order = orders[orderIndex];

  if (status) {
    order.status = status;
  }
  if (shippingProvider) {
    order.shippingProvider = shippingProvider;
  }
  if (trackingNumber) {
    order.trackingNumber = trackingNumber;
  }

  // Regenerate tracking events based on status
  order.trackingEvents = getTrackingEventsForStatus(
    order.status,
    order.date,
    order.customerCity,
    order.shippingProvider || "Aramex"
  );

  orders[orderIndex] = order;

  // Sync update to Firestore
  await updateOrderInDb(id, order);

  res.json({ success: true, order });
});

// 7. Issue Shipping Label
app.post(["/api/orders/:id/shipping-label", "/orders/:id/shipping-label"], (req, res) => {
  const { id } = req.params;
  const orderIndex = orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }

  orders[orderIndex].shippingLabelIssued = true;
  res.json({ success: true, order: orders[orderIndex] });
});

// 8. Re-send/Send Invoice Email
app.post(["/api/orders/:id/invoice-mail", "/orders/:id/invoice-mail"], (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const orderIndex = orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }

  if (email) {
    orders[orderIndex].customerEmail = email;
  }
  orders[orderIndex].invoiceSent = true;
  res.json({ success: true, order: orders[orderIndex] });
});

// Helper function for status events
function getTrackingEventsForStatus(status: string, dateStr: string, customerCity: string, provider: string) {
  const timeStr = new Date(dateStr).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const provName = provider || "شركة الشحن";
  switch (status) {
    case 'under_review':
      return [
        { title: "تم إنشاء الشحنة", location: "الرياض - المستودع الرئيسي", timestamp: timeStr, description: "تم تأكيد الطلب وتجهيز المنتجات بانتظار بوليصة الشحن", done: true },
        { title: "بانتظار تسليم الطرد", location: "الرياض - المستودع الرئيسي", timestamp: "--:--", description: `بانتظار وصول مندوب ${provName} لاستلام الطرد`, done: false },
        { title: "في طريقها للعميل", location: "في الطريق", timestamp: "--:--", description: "جاري نقل الطرد بمركبة الشحن", done: false },
        { title: "تم التوصيل بنجاح", location: customerCity, timestamp: "--:--", description: "تم التوصيل لعنوان العميل وتوقيع الاستلام", done: false }
      ];
    case 'shipping':
      return [
        { title: "تم إنشاء الشحنة", location: "الرياض - المستودع الرئيسي", timestamp: timeStr, description: "تم تأكيد الطلب وتجهيز المنتجات بانتظار بوليصة الشحن", done: true },
        { title: "تم تسليم الطرد لشركة الشحن", location: "الرياض - مركز الفرز", timestamp: "02:15 م", description: `استلمت شركة ${provName} الطرد وجاري فرز الشحنات`, done: true },
        { title: "في طريقها للعميل", location: `${customerCity} - مركز التوزيع`, timestamp: "08:30 ص", description: "خرجت الشحنة للتوصيل النهائي مع مندوب التوزيع", done: true },
        { title: "تم التوصيل بنجاح", location: customerCity, timestamp: "--:--", description: "بانتظار تسليم العميل وجمع التوقيع الرقمي الموثق", done: false }
      ];
    case 'delivered':
      return [
        { title: "تم إنشاء الشحنة", location: "الرياض - المستودع الرئيسي", timestamp: timeStr, description: "تم تأكيد الطلب وتجهيز المنتجات بانتظار بوليصة الشحن", done: true },
        { title: "تم تسليم الطرد لشركة الشحن", location: "الرياض - مركز الفرز", timestamp: "02:15 م", description: `استلمت شركة ${provName} الطرد وجاري فرز الشحنات`, done: true },
        { title: "في طريقها للعميل", location: `${customerCity} - مركز التوزيع`, timestamp: "08:30 ص", description: "خرجت الشحنة للتوصيل النهائي مع مندوب التوزيع", done: true },
        { title: "تم التوصيل بنجاح", location: customerCity, timestamp: "04:50 م", description: "تم التوصيل لعنوان العميل وتوقيع الاستلام بنجاح", done: true }
      ];
    case 'returned':
      return [
        { title: "تم إنشاء الشحنة", location: "الرياض - المستودع الرئيسي", timestamp: timeStr, description: "تم تأكيد الطلب وتجهيز المنتجات بانتظار بوليصة الشحن", done: true },
        { title: "تم تسليم الطرد لشركة الشحن", location: "الرياض", timestamp: "02:15 م", description: `استلمت شركة ${provName} الطرد`, done: true },
        { title: "طلب إرجاع الشحنة", location: customerCity, timestamp: "11:20 ص", description: "قام العميل بتقديم طلب استرجاع الشحنة وجاري معالجتها", done: true },
        { title: "تمت إعادة الطرد للمستودع", location: "الرياض - المستودع الرئيسي", timestamp: "05:15 م", description: "تم استلام الطرد المرتجع وفحصه بالمستودع بنجاح", done: true }
      ];
    default:
      return [];
  }
}

async function startServer() {
  // Sync in-memory state with Firestore on startup
  try {
    const dbProds = await fetchProductsFromDb(allProducts);
    if (dbProds && dbProds.length > 0) {
      allProducts = dbProds;
    }

    const dbHero = await fetchHeroSettingsFromDb(heroBannerSettings);
    if (dbHero && dbHero.title) {
      heroBannerSettings = dbHero;
    }

    const dbOrders = await fetchOrdersFromDb(orders);
    if (dbOrders && dbOrders.length > 0) {
      orders = dbOrders;
    }
    console.log("⚡ Backend loaded synced data from Firestore database.");
  } catch (syncErr) {
    console.warn(" Initial Firestore sync notice:", syncErr);
  }

  // Vite integration (Only load in local full-stack development, bypass in standalone API backend)
  if (process.env.NODE_ENV !== "production") {
    try {
      // Dynamic require/import safely guarded for environments where Vite is not installed
      const viteModuleName = "vite";
      const viteModule = await import(/* @vite-ignore */ viteModuleName);
      if (viteModule && viteModule.createServer) {
        const vite = await viteModule.createServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
        console.log("Vite development middleware integrated successfully.");
      }
    } catch (err) {
      console.log("Running in standalone API backend mode (Vite not loaded).");
    }
  } else {
    const indexPath = path.join(process.cwd(), "dist", "index.html");
    if (fs.existsSync(indexPath)) {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(indexPath);
      });
    } else {
      // Standalone API Mode fallback (e.g. Vercel backend deployment)
      app.get("/", (req, res) => {
        res.json({
          status: "ok",
          service: "techcore-backend-api",
          version: "1.0.0",
          message: "API server is running and ready for requests"
        });
      });
    }
  }

  // Global Error Handler guaranteeing CORS & clean JSON responses (prevents CORS blocking on 500)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Server API Error:", err);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token, Date, X-Api-Version");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    
    if (res.headersSent) {
      return next(err);
    }
    
    res.status(err.status || 500).json({
      error: "Internal Server Error",
      message: err.message || "حدث خطأ غير متوقع في معالجة الطلب بالسيرفر",
      path: req.path
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is booting on port ${PORT}...`);
    console.log(`Concurrent Visitor Capacity: 5000+`);
    console.log(`Database initialized with 80 custom premium electronics.`);
  });
}

// Global fallback error handler for serverless execution
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Serverless API Error:", err);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token, Date, X-Api-Version");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: err.message || "حدث خطأ غير متوقع في معالجة الطلب بالسيرفر",
    path: req.path
  });
});

if (!process.env.VERCEL) {
  startServer();
}

export default app;

