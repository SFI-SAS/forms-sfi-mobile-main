(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? factory(exports)
    : typeof define === "function" && define.amd
      ? define(["exports"], factory)
      : ((global =
          typeof globalThis !== "undefined" ? globalThis : global || self),
        factory((global.SfiFacial = {})));
})(this, function (exports) {
  "use strict";

  class StorageService {
    constructor() {
      this.STORAGE_KEY = "sfi-facial-users";
      this.VERSION_KEY = "sfi-facial-version";
      this.CURRENT_VERSION = "1.0.0";
      this.initializeStorage();
    }
    initializeStorage() {
      const version = localStorage.getItem(this.VERSION_KEY);
      if (version !== this.CURRENT_VERSION) {
        // Migration logic if needed
        localStorage.setItem(this.VERSION_KEY, this.CURRENT_VERSION);
      }
    }
    // ============================================================================
    // User Registration Storage
    // ============================================================================
    saveUser(registrationData) {
      const users = this.getAllUsers();
      // Check if user already exists
      const existingIndex = users.findIndex(
        (user) => user.userData.id === registrationData.userData.id
      );
      const storedUser = {
        id: registrationData.userData.id,
        ...registrationData,
        registeredAt: Date.now(),
      };
      if (existingIndex >= 0) {
        // Update existing user
        users[existingIndex] = storedUser;
      } else {
        // Add new user
        users.push(storedUser);
      }
      this.saveUsers(users);
      return storedUser;
    }
    getUserById(id) {
      const users = this.getAllUsers();
      return users.find((user) => user.id === id) || null;
    }
    getAllUsers() {
      try {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (!data) return [];
        const users = JSON.parse(data);
        return Array.isArray(users) ? users : [];
      } catch (error) {
        console.error("Error loading users from storage:", error);
        return [];
      }
    }
    deleteUser(id) {
      const users = this.getAllUsers();
      const filteredUsers = users.filter((user) => user.id !== id);
      if (filteredUsers.length !== users.length) {
        this.saveUsers(filteredUsers);
        return true;
      }
      return false;
    }
    updateLastValidation(id) {
      const users = this.getAllUsers();
      const userIndex = users.findIndex((user) => user.id === id);
      if (userIndex >= 0) {
        users[userIndex].lastValidatedAt = Date.now();
        this.saveUsers(users);
      }
    }
    // ============================================================================
    // Bulk Operations
    // ============================================================================
    clearAllUsers() {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    exportUsers() {
      const users = this.getAllUsers();
      return JSON.stringify(users, null, 2);
    }
    importUsers(jsonData) {
      try {
        const importedData = JSON.parse(jsonData);
        if (!Array.isArray(importedData)) {
          return {
            success: false,
            imported: 0,
            errors: ["Invalid JSON format - expected array"],
          };
        }
        const errors = [];
        const validUsers = [];
        importedData.forEach((userData, index) => {
          if (this.isValidStoredUser(userData)) {
            validUsers.push(userData);
          } else {
            errors.push(`Invalid user data at index ${index}`);
          }
        });
        if (validUsers.length > 0) {
          const existingUsers = this.getAllUsers();
          const mergedUsers = this.mergeUsers(existingUsers, validUsers);
          this.saveUsers(mergedUsers);
        }
        return {
          success: errors.length === 0,
          imported: validUsers.length,
          errors,
        };
      } catch (error) {
        return {
          success: false,
          imported: 0,
          errors: [
            error instanceof Error ? error.message : "Unknown parsing error",
          ],
        };
      }
    }
    // ============================================================================
    // Statistics and Analytics
    // ============================================================================
    getStorageStats() {
      const users = this.getAllUsers();
      const storageData = localStorage.getItem(this.STORAGE_KEY);
      if (users.length === 0) {
        return {
          totalUsers: 0,
          storageSize: 0,
        };
      }
      const registrationDates = users.map((user) => user.registeredAt);
      const faceScores = users
        .map((user) => user.faceData.livenessScore)
        .filter((score) => score > 0);
      return {
        totalUsers: users.length,
        storageSize: storageData ? new Blob([storageData]).size : 0,
        oldestRegistration: Math.min(...registrationDates),
        newestRegistration: Math.max(...registrationDates),
        averageFaceScore:
          faceScores.length > 0
            ? faceScores.reduce((a, b) => a + b, 0) / faceScores.length
            : undefined,
      };
    }
    // ============================================================================
    // Face Data Utilities
    // ============================================================================
    getFaceDataForComparison(id) {
      const user = this.getUserById(id);
      if (!user) return null;
      return {
        landmarks: user.faceData.landmarks.map((l) =>
          Array.isArray(l) ? l : [l.x, l.y]
        ),
        image: user.faceData.image,
        livenessScore: user.faceData.livenessScore,
      };
    }
    // ============================================================================
    // Private Helpers
    // ============================================================================
    saveUsers(users) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
      } catch (error) {
        console.error("Error saving users to storage:", error);
        throw new Error("Failed to save user data. Storage may be full.");
      }
    }
    isValidStoredUser(data) {
      return (
        data &&
        typeof data.id === "string" &&
        typeof data.registeredAt === "number" &&
        data.userData &&
        typeof data.userData.name === "string" &&
        typeof data.userData.id === "string" &&
        data.faceData &&
        Array.isArray(data.faceData.landmarks) &&
        typeof data.faceData.image === "string" &&
        typeof data.faceData.timestamp === "number" &&
        typeof data.faceData.livenessScore === "number"
      );
    }
    mergeUsers(existing, imported) {
      const merged = [...existing];
      imported.forEach((importedUser) => {
        const existingIndex = merged.findIndex(
          (user) => user.id === importedUser.id
        );
        if (existingIndex >= 0) {
          // Update if imported is newer
          if (importedUser.registeredAt > merged[existingIndex].registeredAt) {
            merged[existingIndex] = importedUser;
          }
        } else {
          merged.push(importedUser);
        }
      });
      return merged;
    }
  }

  class CameraService {
    constructor() {
      this.stream = null;
      this.videoElement = null;
      this.canvas = null;
      this.context = null;
      this.defaultConstraints = {
        width: 640,
        height: 480,
        facingMode: "user",
        frameRate: 30,
      };
    }
    // ============================================================================
    // Camera Initialization
    // ============================================================================
    async getCameraCapabilities() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput"
        );
        const supportedConstraints = navigator.mediaDevices
          .getSupportedConstraints
          ? Object.keys(navigator.mediaDevices.getSupportedConstraints())
          : [];
        return {
          hasCamera: videoDevices.length > 0,
          supportedConstraints,
          devices: videoDevices,
        };
      } catch (error) {
        console.error("Error getting camera capabilities:", error);
        return {
          hasCamera: false,
          supportedConstraints: [],
          devices: [],
        };
      }
    }
    async requestCameraPermission() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch (error) {
        console.error("Camera permission denied:", error);
        return false;
      }
    }
    async startCamera(videoElement, constraints = {}) {
      try {
        console.log("📹 CameraService.startCamera() llamado");
        console.log("🔍 videoElement ID:", videoElement.id);
        console.log(
          "🔍 videoElement actual srcObject:",
          videoElement.srcObject
        );
        // Stop existing stream if any
        if (this.stream) {
          console.log("⚠️ Ya existe un stream, deteniéndolo primero");
          this.stopCamera();
        }
        const finalConstraints = { ...this.defaultConstraints, ...constraints };
        console.log("📹 Solicitando acceso a cámara...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: finalConstraints.width },
            height: { ideal: finalConstraints.height },
            facingMode: finalConstraints.facingMode,
            frameRate: finalConstraints.frameRate,
          },
        });
        console.log("✅ Stream de cámara obtenido:", stream);
        this.stream = stream;
        this.videoElement = videoElement;
        console.log("📹 Asignando stream a videoElement.srcObject");
        videoElement.srcObject = stream;
        console.log(
          "🔍 videoElement.srcObject después de asignar:",
          videoElement.srcObject
        );
        await videoElement.play();
        console.log(
          "✅ Video reproduciendo, readyState:",
          videoElement.readyState
        );
        // Create canvas for image capture
        this.canvas = document.createElement("canvas");
        this.canvas.width = finalConstraints.width;
        this.canvas.height = finalConstraints.height;
        this.context = this.canvas.getContext("2d");
        return { success: true };
      } catch (error) {
        const errorMessage = this.getCameraErrorMessage(error);
        console.error("Failed to start camera:", errorMessage);
        return { success: false, error: errorMessage };
      }
    }
    stopCamera() {
      console.log("🛑 CameraService.stopCamera() llamado");
      console.trace("🔍 Stack trace de stopCamera:");
      if (this.stream) {
        console.log("🛑 Deteniendo stream de cámara");
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.videoElement) {
        console.log("🛑 Limpiando videoElement.srcObject");
        this.videoElement.srcObject = null;
        this.videoElement = null;
      }
      this.canvas = null;
      this.context = null;
    }
    // ============================================================================
    // Image Capture
    // ============================================================================
    captureImage() {
      if (!this.videoElement || !this.canvas || !this.context) {
        console.error("Camera not initialized for capture");
        return null;
      }
      if (
        this.videoElement.videoWidth === 0 ||
        this.videoElement.videoHeight === 0
      ) {
        console.error("Video not ready for capture");
        return null;
      }
      // Draw current video frame to canvas
      this.context.drawImage(
        this.videoElement,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
      // Convert to base64
      return this.canvas.toDataURL("image/jpeg", 0.8);
    }
    captureImageWithSettings(quality = 0.8, format = "image/jpeg") {
      if (!this.videoElement || !this.canvas || !this.context) {
        return null;
      }
      this.context.drawImage(
        this.videoElement,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
      return this.canvas.toDataURL(format, quality);
    }
    // ============================================================================
    // Video Frame Processing
    // ============================================================================
    getCurrentVideoFrame() {
      if (!this.videoElement || !this.canvas || !this.context) {
        return null;
      }
      if (
        this.videoElement.videoWidth === 0 ||
        this.videoElement.videoHeight === 0
      ) {
        return null;
      }
      // Draw current frame
      this.context.drawImage(
        this.videoElement,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
      // Get image data
      return this.context.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
    }
    getVideoElement() {
      return this.videoElement;
    }
    getStream() {
      return this.stream;
    }
    // ============================================================================
    // Camera State Management
    // ============================================================================
    isActive() {
      return this.stream !== null && this.stream.active;
    }
    getStreamSettings() {
      if (!this.stream) return null;
      const videoTrack = this.stream.getVideoTracks()[0];
      return videoTrack ? videoTrack.getSettings() : null;
    }
    getStreamConstraints() {
      if (!this.stream) return null;
      const videoTrack = this.stream.getVideoTracks()[0];
      return videoTrack ? videoTrack.getConstraints() : null;
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    async switchCamera() {
      if (!this.videoElement) {
        return { success: false, error: "No active video element" };
      }
      const currentSettings = this.getStreamSettings();
      const newFacingMode =
        currentSettings?.facingMode === "user" ? "environment" : "user";
      return this.startCamera(this.videoElement, { facingMode: newFacingMode });
    }
    getCameraErrorMessage(error) {
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        return "Acceso a la cámara denegado. Por favor, permite el acceso.";
      }
      if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        return "No se encontró ninguna cámara disponible.";
      }
      if (error.name === "NotSupportedError") {
        return "La cámara no está soportada en este dispositivo.";
      }
      if (error.name === "NotReadableError") {
        return "La cámara está siendo usada por otra aplicación.";
      }
      if (error.name === "OverconstrainedError") {
        return "Las restricciones de cámara no pueden ser satisfechas.";
      }
      return error.message || "Error desconocido al acceder a la cámara";
    }
    // ============================================================================
    // Static Utility Methods
    // ============================================================================
    static async checkCameraSupport() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    static async getAvailableCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((device) => device.kind === "videoinput");
      } catch (error) {
        console.error("Error enumerating devices:", error);
        return [];
      }
    }
  }

  var t = "undefined" != typeof self ? self : {};
  function e() {
    throw Error("Invalid UTF8");
  }
  function n(t, e) {
    return ((e = String.fromCharCode.apply(null, e)), null == t ? e : t + e);
  }
  let r, i;
  const s = "undefined" != typeof TextDecoder;
  let o;
  const a = "undefined" != typeof TextEncoder;
  function c(t) {
    if (a) t = (o ||= new TextEncoder()).encode(t);
    else {
      let n = 0;
      const r = new Uint8Array(3 * t.length);
      for (let i = 0; i < t.length; i++) {
        var e = t.charCodeAt(i);
        if (e < 128) r[n++] = e;
        else {
          if (e < 2048) r[n++] = (e >> 6) | 192;
          else {
            if (e >= 55296 && e <= 57343) {
              if (e <= 56319 && i < t.length) {
                const s = t.charCodeAt(++i);
                if (s >= 56320 && s <= 57343) {
                  ((e = 1024 * (e - 55296) + s - 56320 + 65536),
                    (r[n++] = (e >> 18) | 240),
                    (r[n++] = ((e >> 12) & 63) | 128),
                    (r[n++] = ((e >> 6) & 63) | 128),
                    (r[n++] = (63 & e) | 128));
                  continue;
                }
                i--;
              }
              e = 65533;
            }
            ((r[n++] = (e >> 12) | 224), (r[n++] = ((e >> 6) & 63) | 128));
          }
          r[n++] = (63 & e) | 128;
        }
      }
      t = n === r.length ? r : r.subarray(0, n);
    }
    return t;
  }
  var h, u;
  t: {
    for (var l = ["CLOSURE_FLAGS"], d = t, f = 0; f < l.length; f++)
      if (null == (d = d[l[f]])) {
        u = null;
        break t;
      }
    u = d;
  }
  var p,
    g = u && u[610401301];
  h = null != g && g;
  const m = t.navigator;
  function y(t) {
    return (
      !!h && !!p && p.brands.some(({ brand: e }) => e && -1 != e.indexOf(t))
    );
  }
  function _(e) {
    var n;
    return (
      ((n = t.navigator) && (n = n.userAgent)) || (n = ""),
      -1 != n.indexOf(e)
    );
  }
  function v() {
    return !!h && !!p && p.brands.length > 0;
  }
  function E() {
    return v()
      ? y("Chromium")
      : ((_("Chrome") || _("CriOS")) && !(!v() && _("Edge"))) || _("Silk");
  }
  function w(t) {
    return (w[" "](t), t);
  }
  ((p = (m && m.userAgentData) || null), (w[" "] = function () {}));
  var T = !v() && (_("Trident") || _("MSIE"));
  (!_("Android") || E(),
    E(),
    _("Safari") &&
      (E() ||
        (!v() && _("Coast")) ||
        (!v() && _("Opera")) ||
        (!v() && _("Edge")) ||
        (v() ? y("Microsoft Edge") : _("Edg/")) ||
        (v() && y("Opera"))));
  var A = {},
    b = null;
  function k(t) {
    const e = t.length;
    let n = (3 * e) / 4;
    n % 3
      ? (n = Math.floor(n))
      : -1 != "=.".indexOf(t[e - 1]) &&
        (n = -1 != "=.".indexOf(t[e - 2]) ? n - 2 : n - 1);
    const r = new Uint8Array(n);
    let i = 0;
    return (
      (function (t, e) {
        function n(e) {
          for (; r < t.length; ) {
            const e = t.charAt(r++),
              n = b[e];
            if (null != n) return n;
            if (!/^[\s\xa0]*$/.test(e))
              throw Error("Unknown base64 encoding at char: " + e);
          }
          return e;
        }
        S();
        let r = 0;
        for (;;) {
          const t = n(-1),
            r = n(0),
            i = n(64),
            s = n(64);
          if (64 === s && -1 === t) break;
          (e((t << 2) | (r >> 4)),
            64 != i &&
              (e(((r << 4) & 240) | (i >> 2)),
              64 != s && e(((i << 6) & 192) | s)));
        }
      })(t, function (t) {
        r[i++] = t;
      }),
      i !== n ? r.subarray(0, i) : r
    );
  }
  function S() {
    if (!b) {
      b = {};
      var t =
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(
            ""
          ),
        e = ["+/=", "+/", "-_=", "-_.", "-_"];
      for (let n = 0; n < 5; n++) {
        const r = t.concat(e[n].split(""));
        A[n] = r;
        for (let t = 0; t < r.length; t++) {
          const e = r[t];
          void 0 === b[e] && (b[e] = t);
        }
      }
    }
  }
  var x = "undefined" != typeof Uint8Array,
    L = !T && "function" == typeof btoa;
  function R(t) {
    if (!L) {
      var e;
      (void 0 === e && (e = 0), S(), (e = A[e]));
      var n = Array(Math.floor(t.length / 3)),
        r = e[64] || "";
      let c = 0,
        h = 0;
      for (; c < t.length - 2; c += 3) {
        var i = t[c],
          s = t[c + 1],
          o = t[c + 2],
          a = e[i >> 2];
        ((i = e[((3 & i) << 4) | (s >> 4)]),
          (s = e[((15 & s) << 2) | (o >> 6)]),
          (o = e[63 & o]),
          (n[h++] = a + i + s + o));
      }
      switch (((a = 0), (o = r), t.length - c)) {
        case 2:
          o = e[(15 & (a = t[c + 1])) << 2] || r;
        case 1:
          ((t = t[c]),
            (n[h] = e[t >> 2] + e[((3 & t) << 4) | (a >> 4)] + o + r));
      }
      return n.join("");
    }
    for (e = "", n = 0, r = t.length - 10240; n < r; )
      e += String.fromCharCode.apply(null, t.subarray(n, (n += 10240)));
    return (
      (e += String.fromCharCode.apply(null, n ? t.subarray(n) : t)),
      btoa(e)
    );
  }
  const F = /[-_.]/g,
    I = { "-": "+", _: "/", ".": "=" };
  function M(t) {
    return I[t] || "";
  }
  function P(t) {
    if (!L) return k(t);
    (F.test(t) && (t = t.replace(F, M)), (t = atob(t)));
    const e = new Uint8Array(t.length);
    for (let n = 0; n < t.length; n++) e[n] = t.charCodeAt(n);
    return e;
  }
  function C(t) {
    return x && null != t && t instanceof Uint8Array;
  }
  var O = {};
  function U() {
    return (B ||= new N(null, O));
  }
  function D(t) {
    j(O);
    var e = t.g;
    return null ==
      (e = null == e || C(e) ? e : "string" == typeof e ? P(e) : null)
      ? e
      : (t.g = e);
  }
  var N = class {
    h() {
      return new Uint8Array(D(this) || 0);
    }
    constructor(t, e) {
      if ((j(e), (this.g = t), null != t && 0 === t.length))
        throw Error("ByteString should be constructed with non-empty values");
    }
  };
  let B, G;
  function j(t) {
    if (t !== O) throw Error("illegal external caller");
  }
  function V(t, e) {
    (t.__closure__error__context__984382 ||
      (t.__closure__error__context__984382 = {}),
      (t.__closure__error__context__984382.severity = e));
  }
  function X(t) {
    return (V((t = Error(t)), "warning"), t);
  }
  function H(e) {
    if (null != e) {
      var n = (G ??= {}),
        r = n[e] || 0;
      r >= 5 ||
        ((n[e] = r + 1),
        V((e = Error()), "incident"),
        (function (e) {
          t.setTimeout(() => {
            throw e;
          }, 0);
        })(e));
    }
  }
  var W = "function" == typeof Symbol && "symbol" == typeof Symbol();
  function z(t, e, n = false) {
    return "function" == typeof Symbol && "symbol" == typeof Symbol()
      ? n && Symbol.for && t
        ? Symbol.for(t)
        : null != t
          ? Symbol(t)
          : Symbol()
      : e;
  }
  var K = z("jas", void 0, true),
    Y = z(void 0, "0di"),
    $ = z(void 0, "1oa"),
    q = z(void 0, Symbol()),
    J = z(void 0, "0actk"),
    Z = z(void 0, "8utk");
  const Q = W ? K : "Ea",
    tt = {
      Ea: { value: 0, configurable: true, writable: true, enumerable: false },
    },
    et = Object.defineProperties;
  function nt(t, e) {
    (W || Q in t || et(t, tt), (t[Q] |= e));
  }
  function rt(t, e) {
    (W || Q in t || et(t, tt), (t[Q] = e));
  }
  function it(t) {
    return (nt(t, 34), t);
  }
  function st(t, e) {
    rt(e, -15615 & (0 | t));
  }
  function ot(t, e) {
    rt(e, -15581 & (34 | t));
  }
  function at() {
    return "function" == typeof BigInt;
  }
  function ct(t) {
    return Array.prototype.slice.call(t);
  }
  var ht,
    ut = {};
  function lt(t) {
    return (
      null !== t &&
      "object" == typeof t &&
      !Array.isArray(t) &&
      t.constructor === Object
    );
  }
  function dt(t, e) {
    if (null != t)
      if ("string" == typeof t) t = t ? new N(t, O) : U();
      else if (t.constructor !== N)
        if (C(t)) t = t.length ? new N(new Uint8Array(t), O) : U();
        else {
          if (!e) throw Error();
          t = void 0;
        }
    return t;
  }
  const ft = [];
  function pt(t) {
    if (2 & t) throw Error();
  }
  (rt(ft, 55), (ht = Object.freeze(ft)));
  class gt {
    constructor(t, e, n) {
      ((this.g = t), (this.h = e), (this.l = n));
    }
    next() {
      const t = this.g.next();
      return (t.done || (t.value = this.h.call(this.l, t.value)), t);
    }
    [Symbol.iterator]() {
      return this;
    }
  }
  function mt(t) {
    return q ? t[q] : void 0;
  }
  var yt = Object.freeze({});
  function _t(t) {
    return ((t.Na = true), t);
  }
  var vt = _t((t) => "number" == typeof t),
    Et = _t((t) => "string" == typeof t),
    wt = _t((t) => "boolean" == typeof t),
    Tt = "function" == typeof t.BigInt && "bigint" == typeof t.BigInt(0);
  function At(t) {
    var e = t;
    if (Et(e)) {
      if (!/^\s*(?:-?[1-9]\d*|0)?\s*$/.test(e)) throw Error(String(e));
    } else if (vt(e) && !Number.isSafeInteger(e)) throw Error(String(e));
    return Tt
      ? BigInt(t)
      : (t = wt(t) ? (t ? "1" : "0") : Et(t) ? t.trim() || "0" : String(t));
  }
  var bt = _t((t) =>
    Tt ? t >= St && t <= Lt : "-" === t[0] ? Rt(t, kt) : Rt(t, xt)
  );
  const kt = Number.MIN_SAFE_INTEGER.toString(),
    St = Tt ? BigInt(Number.MIN_SAFE_INTEGER) : void 0,
    xt = Number.MAX_SAFE_INTEGER.toString(),
    Lt = Tt ? BigInt(Number.MAX_SAFE_INTEGER) : void 0;
  function Rt(t, e) {
    if (t.length > e.length) return false;
    if (t.length < e.length || t === e) return true;
    for (let n = 0; n < t.length; n++) {
      const r = t[n],
        i = e[n];
      if (r > i) return false;
      if (r < i) return true;
    }
  }
  const Ft = "function" == typeof Uint8Array.prototype.slice;
  let It,
    Mt = 0,
    Pt = 0;
  function Ct(t) {
    const e = t >>> 0;
    ((Mt = e), (Pt = ((t - e) / 4294967296) >>> 0));
  }
  function Ot(t) {
    if (t < 0) {
      Ct(-t);
      const [e, n] = Xt(Mt, Pt);
      ((Mt = e >>> 0), (Pt = n >>> 0));
    } else Ct(t);
  }
  function Ut(t) {
    const e = (It ||= new DataView(new ArrayBuffer(8)));
    (e.setFloat32(0, +t, true), (Pt = 0), (Mt = e.getUint32(0, true)));
  }
  function Dt(t, e) {
    const n = 4294967296 * e + (t >>> 0);
    return Number.isSafeInteger(n) ? n : Bt(t, e);
  }
  function Nt(t, e) {
    const n = 2147483648 & e;
    return (
      n && ((e = ~e >>> 0), 0 == (t = (1 + ~t) >>> 0) && (e = (e + 1) >>> 0)),
      "number" == typeof (t = Dt(t, e)) ? (n ? -t : t) : n ? "-" + t : t
    );
  }
  function Bt(t, e) {
    if (((t >>>= 0), (e >>>= 0) <= 2097151)) var n = "" + (4294967296 * e + t);
    else
      at()
        ? (n = "" + ((BigInt(e) << BigInt(32)) | BigInt(t)))
        : ((t =
            (16777215 & t) +
            6777216 * (n = 16777215 & ((t >>> 24) | (e << 8))) +
            6710656 * (e = (e >> 16) & 65535)),
          (n += 8147497 * e),
          (e *= 2),
          t >= 1e7 && ((n += (t / 1e7) >>> 0), (t %= 1e7)),
          n >= 1e7 && ((e += (n / 1e7) >>> 0), (n %= 1e7)),
          (n = e + Gt(n) + Gt(t)));
    return n;
  }
  function Gt(t) {
    return ((t = String(t)), "0000000".slice(t.length) + t);
  }
  function jt() {
    var t = Mt,
      e = Pt;
    if (2147483648 & e)
      if (at()) t = "" + ((BigInt(0 | e) << BigInt(32)) | BigInt(t >>> 0));
      else {
        const [n, r] = Xt(t, e);
        t = "-" + Bt(n, r);
      }
    else t = Bt(t, e);
    return t;
  }
  function Vt(t) {
    if (t.length < 16) Ot(Number(t));
    else if (at())
      ((t = BigInt(t)),
        (Mt = Number(t & BigInt(4294967295)) >>> 0),
        (Pt = Number((t >> BigInt(32)) & BigInt(4294967295))));
    else {
      const e = +("-" === t[0]);
      Pt = Mt = 0;
      const n = t.length;
      for (let r = e, i = ((n - e) % 6) + e; i <= n; r = i, i += 6) {
        const e = Number(t.slice(r, i));
        ((Pt *= 1e6),
          (Mt = 1e6 * Mt + e),
          Mt >= 4294967296 &&
            ((Pt += Math.trunc(Mt / 4294967296)), (Pt >>>= 0), (Mt >>>= 0)));
      }
      if (e) {
        const [t, e] = Xt(Mt, Pt);
        ((Mt = t), (Pt = e));
      }
    }
  }
  function Xt(t, e) {
    return ((e = ~e), t ? (t = 1 + ~t) : (e += 1), [t, e]);
  }
  const Ht = "function" == typeof BigInt ? BigInt.asIntN : void 0,
    Wt = "function" == typeof BigInt ? BigInt.asUintN : void 0,
    zt = Number.isSafeInteger,
    Kt = Number.isFinite,
    Yt = Math.trunc,
    $t = At(0);
  function qt(t) {
    return null == t || "number" == typeof t
      ? t
      : "NaN" === t || "Infinity" === t || "-Infinity" === t
        ? Number(t)
        : void 0;
  }
  function Jt(t) {
    return null == t || "boolean" == typeof t
      ? t
      : "number" == typeof t
        ? !!t
        : void 0;
  }
  const Zt = /^-?([1-9][0-9]*|0)(\.[0-9]+)?$/;
  function Qt(t) {
    switch (typeof t) {
      case "bigint":
        return true;
      case "number":
        return Kt(t);
      case "string":
        return Zt.test(t);
      default:
        return false;
    }
  }
  function te(t) {
    if (null == t) return t;
    if ("string" == typeof t && t) t = +t;
    else if ("number" != typeof t) return;
    return Kt(t) ? 0 | t : void 0;
  }
  function ee(t) {
    if (null == t) return t;
    if ("string" == typeof t && t) t = +t;
    else if ("number" != typeof t) return;
    return Kt(t) ? t >>> 0 : void 0;
  }
  function ne(t) {
    if ("-" === t[0]) return false;
    const e = t.length;
    return e < 20 || (20 === e && Number(t.substring(0, 6)) < 184467);
  }
  function re(t) {
    const e = t.length;
    return "-" === t[0]
      ? e < 20 || (20 === e && Number(t.substring(0, 7)) > -922337)
      : e < 19 || (19 === e && Number(t.substring(0, 6)) < 922337);
  }
  function ie(t) {
    return re(t) ? t : (Vt(t), jt());
  }
  function se(t) {
    return ((t = Yt(t)), zt(t) || (Ot(t), (t = Nt(Mt, Pt))), t);
  }
  function oe(t) {
    var e = Yt(Number(t));
    return zt(e)
      ? String(e)
      : (-1 !== (e = t.indexOf(".")) && (t = t.substring(0, e)), ie(t));
  }
  function ae(t) {
    var e = Yt(Number(t));
    return zt(e)
      ? At(e)
      : (-1 !== (e = t.indexOf(".")) && (t = t.substring(0, e)),
        at() ? At(Ht(64, BigInt(t))) : At(ie(t)));
  }
  function ce(t) {
    if (zt(t)) t = At(se(t));
    else {
      if (((t = Yt(t)), zt(t))) t = String(t);
      else {
        const e = String(t);
        re(e) ? (t = e) : (Ot(t), (t = jt()));
      }
      t = At(t);
    }
    return t;
  }
  function he(t) {
    return null == t
      ? t
      : "bigint" == typeof t
        ? (bt(t)
            ? (t = Number(t))
            : ((t = Ht(64, t)), (t = bt(t) ? Number(t) : String(t))),
          t)
        : Qt(t)
          ? "number" == typeof t
            ? se(t)
            : oe(t)
          : void 0;
  }
  function ue(t) {
    if (null == t) return t;
    var e = typeof t;
    if ("bigint" === e) return String(Wt(64, t));
    if (Qt(t)) {
      if ("string" === e)
        return (
          (e = Yt(Number(t))),
          zt(e) && e >= 0
            ? (t = String(e))
            : (-1 !== (e = t.indexOf(".")) && (t = t.substring(0, e)),
              ne(t) || (Vt(t), (t = Bt(Mt, Pt)))),
          t
        );
      if ("number" === e)
        return (t = Yt(t)) >= 0 && zt(t)
          ? t
          : (function (t) {
              if (t < 0) {
                Ot(t);
                var e = Bt(Mt, Pt);
                return ((t = Number(e)), zt(t) ? t : e);
              }
              return ne((e = String(t))) ? e : (Ot(t), Dt(Mt, Pt));
            })(t);
    }
  }
  function le(t) {
    if ("string" != typeof t) throw Error();
    return t;
  }
  function de(t) {
    if (null != t && "string" != typeof t) throw Error();
    return t;
  }
  function fe(t) {
    return null == t || "string" == typeof t ? t : void 0;
  }
  function pe(t, e, n, r) {
    if (null != t && "object" == typeof t && t.W === ut) return t;
    if (!Array.isArray(t))
      return (
        n
          ? 2 & r
            ? ((t = e[Y]) || (it((t = new e()).u), (t = e[Y] = t)), (e = t))
            : (e = new e())
          : (e = void 0),
        e
      );
    let i = (n = 0 | t[Q]);
    return (
      0 === i && (i |= 32 & r),
      (i |= 2 & r),
      i !== n && rt(t, i),
      new e(t)
    );
  }
  function ge(t, e, n) {
    if (e)
      t: {
        if (!Qt((e = t))) throw X("int64");
        switch (typeof e) {
          case "string":
            e = ae(e);
            break t;
          case "bigint":
            e = At(Ht(64, e));
            break t;
          default:
            e = ce(e);
        }
      }
    else
      ((t = typeof (e = t)),
        (e =
          null == e
            ? e
            : "bigint" === t
              ? At(Ht(64, e))
              : Qt(e)
                ? "string" === t
                  ? ae(e)
                  : ce(e)
                : void 0));
    return null == (t = e) ? (n ? $t : void 0) : t;
  }
  function me(t) {
    return t;
  }
  const ye = {};
  let _e = (function () {
    try {
      return (
        w(
          new (class extends Map {
            constructor() {
              super();
            }
          })()
        ),
        !1
      );
    } catch {
      return true;
    }
  })();
  class ve {
    constructor() {
      this.g = new Map();
    }
    get(t) {
      return this.g.get(t);
    }
    set(t, e) {
      return (this.g.set(t, e), (this.size = this.g.size), this);
    }
    delete(t) {
      return ((t = this.g.delete(t)), (this.size = this.g.size), t);
    }
    clear() {
      (this.g.clear(), (this.size = this.g.size));
    }
    has(t) {
      return this.g.has(t);
    }
    entries() {
      return this.g.entries();
    }
    keys() {
      return this.g.keys();
    }
    values() {
      return this.g.values();
    }
    forEach(t, e) {
      return this.g.forEach(t, e);
    }
    [Symbol.iterator]() {
      return this.entries();
    }
  }
  const Ee = _e
    ? (Object.setPrototypeOf(ve.prototype, Map.prototype),
      Object.defineProperties(ve.prototype, {
        size: {
          value: 0,
          configurable: true,
          enumerable: true,
          writable: true,
        },
      }),
      ve)
    : class extends Map {
        constructor() {
          super();
        }
      };
  function we(t) {
    return t;
  }
  function Te(t) {
    if (2 & t.M) throw Error("Cannot mutate an immutable Map");
  }
  var Ae = class extends Ee {
    constructor(t, e, n = we, r = we) {
      super();
      let i = 0 | t[Q];
      ((i |= 64),
        rt(t, i),
        (this.M = i),
        (this.I = e),
        (this.S = n),
        (this.X = this.I ? be : r));
      for (let s = 0; s < t.length; s++) {
        const o = t[s],
          a = n(o[0], false, true);
        let c = o[1];
        (e
          ? void 0 === c && (c = null)
          : (c = r(o[1], false, true, void 0, void 0, i)),
          super.set(a, c));
      }
    }
    La() {
      var t = Ce;
      if (0 !== this.size)
        return Array.from(
          super.entries(),
          (e) => ((e[0] = t(e[0])), (e[1] = t(e[1])), e)
        );
    }
    da(t = ke) {
      const e = [],
        n = super.entries();
      for (var r; !(r = n.next()).done; )
        (((r = r.value)[0] = t(r[0])), (r[1] = t(r[1])), e.push(r));
      return e;
    }
    clear() {
      (Te(this), super.clear());
    }
    delete(t) {
      return (Te(this), super.delete(this.S(t, true, false)));
    }
    entries() {
      if (this.I) {
        var t = super.keys();
        t = new gt(t, Se, this);
      } else t = super.entries();
      return t;
    }
    values() {
      if (this.I) {
        var t = super.keys();
        t = new gt(t, Ae.prototype.get, this);
      } else t = super.values();
      return t;
    }
    forEach(t, e) {
      this.I
        ? super.forEach((n, r, i) => {
            t.call(e, i.get(r), r, i);
          })
        : super.forEach(t, e);
    }
    set(t, e) {
      return (
        Te(this),
        null == (t = this.S(t, true, false))
          ? this
          : null == e
            ? (super.delete(t), this)
            : super.set(t, this.X(e, true, true, this.I, false, this.M))
      );
    }
    Ja(t) {
      const e = this.S(t[0], false, true);
      ((t = t[1]),
        (t = this.I
          ? void 0 === t
            ? null
            : t
          : this.X(t, false, true, void 0, false, this.M)),
        super.set(e, t));
    }
    has(t) {
      return super.has(this.S(t, false, false));
    }
    get(t) {
      t = this.S(t, false, false);
      const e = super.get(t);
      if (void 0 !== e) {
        var n = this.I;
        return n
          ? ((n = this.X(e, false, true, n, this.pa, this.M)) !== e &&
              super.set(t, n),
            n)
          : e;
      }
    }
    [Symbol.iterator]() {
      return this.entries();
    }
  };
  function be(t, e, n, r, i, s) {
    return ((t = pe(t, r, n, s)), i && (t = je(t)), t);
  }
  function ke(t) {
    return t;
  }
  function Se(t) {
    return [t, this.get(t)];
  }
  let xe, Le, Re, Fe;
  function Ie() {
    return (xe ||= new Ae(it([]), void 0, void 0, void 0, ye));
  }
  function Me(t, e, n, r, i) {
    if (null != t) {
      if (Array.isArray(t)) {
        const s = 0 | t[Q];
        return 0 === t.length && 1 & s
          ? void 0
          : i && 2 & s
            ? t
            : Pe(t, e, n, void 0 !== r, i);
      }
      return e(t, r);
    }
  }
  function Pe(t, e, n, r, i) {
    const s = r || n ? 0 | t[Q] : 0,
      o = r ? !!(32 & s) : void 0;
    let a = 0;
    const c = (r = ct(t)).length;
    for (let t = 0; t < c; t++) {
      var h = r[t];
      if (t === c - 1 && lt(h)) {
        var u = e,
          l = n,
          d = o,
          f = i;
        let t;
        for (let e in h) {
          const n = Me(h[e], u, l, d, f);
          null != n && ((t ??= {})[e] = n);
        }
        h = t;
      } else h = Me(r[t], e, n, o, i);
      ((r[t] = h), null != h && (a = t + 1));
    }
    return (
      a < c && (r.length = a),
      n && ((t = mt(t)) && (r[q] = ct(t)), n(s, r)),
      r
    );
  }
  function Ce(t) {
    return Me(t, Oe, void 0, void 0, false);
  }
  function Oe(t) {
    switch (typeof t) {
      case "number":
        return Number.isFinite(t) ? t : "" + t;
      case "bigint":
        return bt(t) ? Number(t) : "" + t;
      case "boolean":
        return t ? 1 : 0;
      case "object":
        if (C(t)) return (C(t) && H(Z), R(t));
        if (t.W === ut) return Ue(t);
        if (t instanceof N) {
          const e = t.g;
          return null == e ? "" : "string" == typeof e ? e : (t.g = R(e));
        }
        return t instanceof Ae ? t.La() : void 0;
    }
    return t;
  }
  function Ue(t) {
    var e = t.u;
    t = Pe(e, Oe, void 0, void 0, false);
    var n = 0 | e[Q];
    if ((e = t.length) && !(512 & n)) {
      var r = t[e - 1],
        i = false;
      lt(r) ? (e--, (i = true)) : (r = void 0);
      var s = e - (n = 512 & n ? 0 : -1),
        o = (Le ?? me)(s, n, t, r);
      if ((r && (t[e] = void 0), s < o && r)) {
        for (var a in ((s = true), r)) {
          const c = +a;
          c <= o
            ? ((t[(i = c + n)] = r[a]),
              (e = Math.max(i + 1, e)),
              (i = false),
              delete r[a])
            : (s = false);
        }
        s && (r = void 0);
      }
      for (s = e - 1; e > 0; s = e - 1)
        if (null == (a = t[s])) (e--, (i = true));
        else {
          if (!((s -= n) >= o)) break;
          (((r ??= {})[s] = a), e--, (i = true));
        }
      (i && (t.length = e), r && t.push(r));
    }
    return t;
  }
  function De(t, e, n) {
    return (
      (t = Ne(t, e[0], e[1], n ? 1 : 2)),
      e !== Re && n && nt(t, 8192),
      t
    );
  }
  function Ne(t, e, n, r) {
    if (null == t) {
      var i = 96;
      (n ? ((t = [n]), (i |= 512)) : (t = []),
        e && (i = (-16760833 & i) | ((1023 & e) << 14)));
    } else {
      if (!Array.isArray(t)) throw Error("narr");
      if ((8192 & (i = 0 | t[Q]) || !(64 & i) || 2 & i || H(J), 1024 & i))
        throw Error("farr");
      if (64 & i) return t;
      if ((1 === r || 2 === r || (i |= 64), n && ((i |= 512), n !== t[0])))
        throw Error("mid");
      t: {
        var s = (n = t).length;
        if (s) {
          var o = s - 1;
          if (lt((r = n[o]))) {
            if ((o -= e = 512 & (i |= 256) ? 0 : -1) >= 1024)
              throw Error("pvtlmt");
            for (var a in r) (s = +a) < o && ((n[s + e] = r[a]), delete r[a]);
            i = (-16760833 & i) | ((1023 & o) << 14);
            break t;
          }
        }
        if (e) {
          if ((a = Math.max(e, s - (512 & i ? 0 : -1))) > 1024)
            throw Error("spvt");
          i = (-16760833 & i) | ((1023 & a) << 14);
        }
      }
    }
    return (rt(t, i), t);
  }
  function Be(t, e, n = ot) {
    if (null != t) {
      if (x && t instanceof Uint8Array) return e ? t : new Uint8Array(t);
      if (Array.isArray(t)) {
        var r = 0 | t[Q];
        return 2 & r
          ? t
          : ((e &&= 0 === r || (!!(32 & r) && !(64 & r || !(16 & r)))),
            e
              ? (rt(t, 34 | r), 4 & r && Object.freeze(t), t)
              : Pe(t, Be, 4 & r ? ot : n, true, true));
      }
      return (
        t.W === ut
          ? (t =
              2 & (r = 0 | (n = t.u)[Q])
                ? t
                : new t.constructor(Ge(n, r, true)))
          : t instanceof Ae &&
            !(2 & t.M) &&
            ((n = it(t.da(Be))), (t = new Ae(n, t.I, t.S, t.X))),
        t
      );
    }
  }
  function Ge(t, e, n) {
    const r = n || 2 & e ? ot : st,
      i = !!(32 & e);
    return (
      (t = (function (t, e, n) {
        const r = ct(t);
        var i = r.length;
        const s = 256 & e ? r[i - 1] : void 0;
        for (i += s ? -1 : 0, e = 512 & e ? 1 : 0; e < i; e++) r[e] = n(r[e]);
        if (s) {
          e = r[e] = {};
          for (const t in s) e[t] = n(s[t]);
        }
        return ((t = mt(t)) && (r[q] = ct(t)), r);
      })(t, e, (t) => Be(t, i, r))),
      nt(t, 32 | (n ? 2 : 0)),
      t
    );
  }
  function je(t) {
    const e = t.u,
      n = 0 | e[Q];
    return 2 & n ? new t.constructor(Ge(e, n, false)) : t;
  }
  function Ve(t, e) {
    return Xe((t = t.u), 0 | t[Q], e);
  }
  function Xe(t, e, n) {
    if (-1 === n) return null;
    const r = n + (512 & e ? 0 : -1),
      i = t.length - 1;
    return r >= i && 256 & e ? t[i][n] : r <= i ? t[r] : void 0;
  }
  function He(t, e, n) {
    const r = t.u;
    let i = 0 | r[Q];
    return (pt(i), We(r, i, e, n), t);
  }
  function We(t, e, n, r) {
    const i = 512 & e ? 0 : -1,
      s = n + i;
    var o = t.length - 1;
    return s >= o && 256 & e
      ? ((t[o][n] = r), e)
      : s <= o
        ? ((t[s] = r), e)
        : (void 0 !== r &&
            (n >= (o = (e >> 14) & 1023 || 536870912)
              ? null != r && ((t[o + i] = { [n]: r }), rt(t, (e |= 256)))
              : (t[s] = r)),
          e);
  }
  function ze(t, e) {
    let n = 0 | (t = t.u)[Q];
    const r = Xe(t, n, e),
      i = qt(r);
    return (null != i && i !== r && We(t, n, e, i), i);
  }
  function Ke(t) {
    let e = 0 | (t = t.u)[Q];
    const n = Xe(t, e, 1),
      r = dt(n, true);
    return (null != r && r !== n && We(t, e, 1, r), r);
  }
  function Ye() {
    return void 0 === yt ? 2 : 4;
  }
  function $e(t, e, n, r, i) {
    const s = t.u,
      o = 2 & (t = 0 | s[Q]) ? 1 : r;
    i = !!i;
    let a = 0 | (r = qe(s, t, e))[Q];
    if (!(4 & a)) {
      4 & a && ((r = ct(r)), (a = pn(a, t)), (t = We(s, t, e, r)));
      let i = 0,
        o = 0;
      for (; i < r.length; i++) {
        const t = n(r[i]);
        null != t && (r[o++] = t);
      }
      (o < i && (r.length = o),
        (a = Je(a, t)),
        (n = -2049 & (20 | a)),
        (a = n &= -4097),
        rt(r, a),
        2 & a && Object.freeze(r));
    }
    return (
      1 === o || (4 === o && 32 & a)
        ? Ze(a) || ((i = a), (a |= 2), a !== i && rt(r, a), Object.freeze(r))
        : (2 === o &&
            Ze(a) &&
            ((r = ct(r)),
            (a = pn(a, t)),
            (a = gn(a, t, i)),
            rt(r, a),
            (t = We(s, t, e, r))),
          Ze(a) || ((e = a), (a = gn(a, t, i)), a !== e && rt(r, a))),
      r
    );
  }
  function qe(t, e, n) {
    return ((t = Xe(t, e, n)), Array.isArray(t) ? t : ht);
  }
  function Je(t, e) {
    return (0 === t && (t = pn(t, e)), 1 | t);
  }
  function Ze(t) {
    return (!!(2 & t) && !!(4 & t)) || !!(1024 & t);
  }
  function Qe(t) {
    t = ct(t);
    for (let e = 0; e < t.length; e++) {
      const n = (t[e] = ct(t[e]));
      Array.isArray(n[1]) && (n[1] = it(n[1]));
    }
    return t;
  }
  function tn(t, e, n, r) {
    let i = 0 | (t = t.u)[Q];
    (pt(i), We(t, i, e, ("0" === r ? 0 === Number(n) : n === r) ? void 0 : n));
  }
  function en(t, e, n, r) {
    pt(e);
    let i = qe(t, e, n);
    const s = i !== ht;
    if (64 & e || !(8192 & e) || !s) {
      const o = s ? 0 | i[Q] : 0;
      let a = o;
      ((!s || 2 & a || Ze(a) || (4 & a && !(32 & a))) &&
        ((i = ct(i)), (a = pn(a, e)), (e = We(t, e, n, i))),
        (a = -13 & Je(a, e)),
        (a = gn(r ? -17 & a : 16 | a, e, true)),
        a !== o && rt(i, a));
    }
    return i;
  }
  function nn(t, e) {
    var n = Ts;
    return on(rn((t = t.u)), t, 0 | t[Q], n) === e ? e : -1;
  }
  function rn(t) {
    if (W) return t[$] ?? (t[$] = new Map());
    if ($ in t) return t[$];
    const e = new Map();
    return (Object.defineProperty(t, $, { value: e }), e);
  }
  function sn(t, e, n, r) {
    const i = rn(t),
      s = on(i, t, e, n);
    return (s !== r && (s && (e = We(t, e, s)), i.set(n, r)), e);
  }
  function on(t, e, n, r) {
    let i = t.get(r);
    if (null != i) return i;
    i = 0;
    for (let t = 0; t < r.length; t++) {
      const s = r[t];
      null != Xe(e, n, s) && (0 !== i && (n = We(e, n, i)), (i = s));
    }
    return (t.set(r, i), i);
  }
  function an(t, e, n) {
    let r = 0 | t[Q];
    const i = Xe(t, r, n);
    let s;
    if (null != i && i.W === ut)
      return ((e = je(i)) !== i && We(t, r, n, e), e.u);
    if (Array.isArray(i)) {
      const t = 0 | i[Q];
      s = 2 & t ? De(Ge(i, t, false), e, true) : 64 & t ? i : De(s, e, true);
    } else s = De(void 0, e, true);
    return (s !== i && We(t, r, n, s), s);
  }
  function cn(t, e, n) {
    let r = 0 | (t = t.u)[Q];
    const i = Xe(t, r, n);
    return ((e = pe(i, e, false, r)) !== i && null != e && We(t, r, n, e), e);
  }
  function hn(t, e, n) {
    if (null == (e = cn(t, e, n))) return e;
    let r = 0 | (t = t.u)[Q];
    if (!(2 & r)) {
      const i = je(e);
      i !== e && We(t, r, n, (e = i));
    }
    return e;
  }
  function un(t, e, n, r, i, s, o) {
    t = t.u;
    var a = !!(2 & e);
    const c = a ? 1 : i;
    ((s = !!s), (o &&= !a));
    var h = 0 | (i = qe(t, e, r))[Q];
    if (!(a = !!(4 & h))) {
      var u = i,
        l = e;
      const t = !!(2 & (h = Je(h, e)));
      t && (l |= 2);
      let r = !t,
        s = true,
        o = 0,
        a = 0;
      for (; o < u.length; o++) {
        const e = pe(u[o], n, false, l);
        if (e instanceof n) {
          if (!t) {
            const t = !!(2 & (0 | e.u[Q]));
            ((r &&= !t), (s &&= t));
          }
          u[a++] = e;
        }
      }
      (a < o && (u.length = a),
        (h |= 4),
        (h = s ? 16 | h : -17 & h),
        rt(u, (h = r ? 8 | h : -9 & h)),
        t && Object.freeze(u));
    }
    if (o && !(8 & h || (!i.length && (1 === c || (4 === c && 32 & h))))) {
      for (
        Ze(h) && ((i = ct(i)), (h = pn(h, e)), (e = We(t, e, r, i))),
          n = i,
          o = h,
          u = 0;
        u < n.length;
        u++
      )
        (h = n[u]) !== (l = je(h)) && (n[u] = l);
      ((o |= 8), rt(n, (o = n.length ? -17 & o : 16 | o)), (h = o));
    }
    return (
      1 === c || (4 === c && 32 & h)
        ? Ze(h) ||
          ((e = h),
          (h |= !i.length || (16 & h && (!a || 32 & h)) ? 2 : 1024) !== e &&
            rt(i, h),
          Object.freeze(i))
        : (2 === c &&
            Ze(h) &&
            (rt((i = ct(i)), (h = gn((h = pn(h, e)), e, s))),
            (e = We(t, e, r, i))),
          Ze(h) || ((r = h), (h = gn(h, e, s)) !== r && rt(i, h))),
      i
    );
  }
  function ln(t, e, n) {
    const r = 0 | t.u[Q];
    return un(t, r, e, n, Ye(), false, !(2 & r));
  }
  function dn(t, e, n, r) {
    return (null == r && (r = void 0), He(t, n, r));
  }
  function fn(t, e, n, r) {
    null == r && (r = void 0);
    t: {
      let i = 0 | (t = t.u)[Q];
      if ((pt(i), null == r)) {
        const r = rn(t);
        if (on(r, t, i, n) !== e) break t;
        r.set(n, 0);
      } else i = sn(t, i, n, e);
      We(t, i, e, r);
    }
  }
  function pn(t, e) {
    return -1025 & (t = 32 | (2 & e ? 2 | t : -3 & t));
  }
  function gn(t, e, n) {
    return ((32 & e && n) || (t &= -33), t);
  }
  function mn(t, e, n) {
    (pt(0 | t.u[Q]), $e(t, e, fe, 2, true).push(le(n)));
  }
  function yn(t, e, n, r) {
    const i = 0 | t.u[Q];
    (pt(i),
      (t = un(t, i, n, e, 2, true)),
      (r = null != r ? r : new n()),
      t.push(r),
      (t[Q] = 2 & (0 | r.u[Q]) ? -9 & t[Q] : -17 & t[Q]));
  }
  function _n(t, e) {
    return te(Ve(t, e));
  }
  function vn(t, e) {
    return fe(Ve(t, e));
  }
  function En(t, e) {
    return ze(t, e) ?? 0;
  }
  function wn(t, e, n) {
    if (null != n && "boolean" != typeof n)
      throw (
        (t = typeof n),
        Error(
          `Expected boolean but got ${"object" != t ? t : n ? (Array.isArray(n) ? "array" : t) : "null"}: ${n}`
        )
      );
    He(t, e, n);
  }
  function Tn(t, e, n) {
    if (null != n) {
      if ("number" != typeof n) throw X("int32");
      if (!Kt(n)) throw X("int32");
      n |= 0;
    }
    He(t, e, n);
  }
  function An(t, e, n) {
    if (null != n && "number" != typeof n)
      throw Error(
        `Value of float/double field must be a number, found ${typeof n}: ${n}`
      );
    He(t, e, n);
  }
  function bn(t, e, n) {
    {
      const o = t.u;
      let a = 0 | o[Q];
      if ((pt(a), null == n)) We(o, a, e);
      else {
        var r = (t = 0 | n[Q]),
          i = Ze(t),
          s = i || Object.isFrozen(n);
        for (
          i || (t = 0),
            s ||
              ((n = ct(n)),
              (r = 0),
              (t = gn((t = pn(t, a)), a, true)),
              (s = false)),
            t |= 21,
            i = 0;
          i < n.length;
          i++
        ) {
          const e = n[i],
            o = le(e);
          Object.is(e, o) ||
            (s &&
              ((n = ct(n)),
              (r = 0),
              (t = gn((t = pn(t, a)), a, true)),
              (s = false)),
            (n[i] = o));
        }
        (t !== r &&
          (s && ((n = ct(n)), (t = gn((t = pn(t, a)), a, true))), rt(n, t)),
          We(o, a, e, n));
      }
    }
  }
  function kn(t, e) {
    return Error(`Invalid wire type: ${t} (at position ${e})`);
  }
  function Sn() {
    return Error("Failed to read varint, encoding is invalid.");
  }
  function xn(t, e) {
    return Error(`Tried to read past the end of the data ${e} > ${t}`);
  }
  function Ln(t) {
    if ("string" == typeof t) return { buffer: P(t), O: false };
    if (Array.isArray(t)) return { buffer: new Uint8Array(t), O: false };
    if (t.constructor === Uint8Array) return { buffer: t, O: false };
    if (t.constructor === ArrayBuffer)
      return { buffer: new Uint8Array(t), O: false };
    if (t.constructor === N)
      return { buffer: D(t) || new Uint8Array(0), O: true };
    if (t instanceof Uint8Array)
      return {
        buffer: new Uint8Array(t.buffer, t.byteOffset, t.byteLength),
        O: false,
      };
    throw Error(
      "Type not convertible to a Uint8Array, expected a Uint8Array, an ArrayBuffer, a base64 encoded string, a ByteString or an Array of numbers"
    );
  }
  function Rn(t, e) {
    let n,
      r = 0,
      i = 0,
      s = 0;
    const o = t.h;
    let a = t.g;
    do {
      ((n = o[a++]), (r |= (127 & n) << s), (s += 7));
    } while (s < 32 && 128 & n);
    for (s > 32 && (i |= (127 & n) >> 4), s = 3; s < 32 && 128 & n; s += 7)
      ((n = o[a++]), (i |= (127 & n) << s));
    if ((Dn(t, a), n < 128)) return e(r >>> 0, i >>> 0);
    throw Sn();
  }
  function Fn(t) {
    let e = 0,
      n = t.g;
    const r = n + 10,
      i = t.h;
    for (; n < r; ) {
      const r = i[n++];
      if (((e |= r), 0 == (128 & r))) return (Dn(t, n), !!(127 & e));
    }
    throw Sn();
  }
  function In(t) {
    const e = t.h;
    let n = t.g,
      r = e[n++],
      i = 127 & r;
    if (
      128 & r &&
      ((r = e[n++]),
      (i |= (127 & r) << 7),
      128 & r &&
        ((r = e[n++]),
        (i |= (127 & r) << 14),
        128 & r &&
          ((r = e[n++]),
          (i |= (127 & r) << 21),
          128 & r &&
            ((r = e[n++]),
            (i |= r << 28),
            128 & r &&
              128 & e[n++] &&
              128 & e[n++] &&
              128 & e[n++] &&
              128 & e[n++] &&
              128 & e[n++]))))
    )
      throw Sn();
    return (Dn(t, n), i);
  }
  function Mn(t) {
    return In(t) >>> 0;
  }
  function Pn(t) {
    var e = t.h;
    const n = t.g,
      r = e[n],
      i = e[n + 1],
      s = e[n + 2];
    return (
      (e = e[n + 3]),
      Dn(t, t.g + 4),
      ((r << 0) | (i << 8) | (s << 16) | (e << 24)) >>> 0
    );
  }
  function Cn(t) {
    var e = Pn(t);
    t = 2 * (e >> 31) + 1;
    const n = (e >>> 23) & 255;
    return (
      (e &= 8388607),
      255 == n
        ? e
          ? NaN
          : t * (1 / 0)
        : 0 == n
          ? 1401298464324817e-60 * t * e
          : t * Math.pow(2, n - 150) * (e + 8388608)
    );
  }
  function On(t) {
    return In(t);
  }
  function Un(t, e, { aa: n = false } = {}) {
    ((t.aa = n),
      e &&
        ((e = Ln(e)),
        (t.h = e.buffer),
        (t.m = e.O),
        (t.j = 0),
        (t.l = t.h.length),
        (t.g = t.j)));
  }
  function Dn(t, e) {
    if (((t.g = e), e > t.l)) throw xn(t.l, e);
  }
  function Nn(t, e) {
    if (e < 0) throw Error(`Tried to read a negative byte length: ${e}`);
    const n = t.g,
      r = n + e;
    if (r > t.l) throw xn(e, t.l - n);
    return ((t.g = r), n);
  }
  function Bn(t, e) {
    if (0 == e) return U();
    var n = Nn(t, e);
    return (
      t.aa && t.m
        ? (n = t.h.subarray(n, n + e))
        : ((t = t.h),
          (n =
            n === (e = n + e)
              ? new Uint8Array(0)
              : Ft
                ? t.slice(n, e)
                : new Uint8Array(t.subarray(n, e)))),
      0 == n.length ? U() : new N(n, O)
    );
  }
  Ae.prototype.toJSON = void 0;
  var Gn = [];
  function jn(t) {
    var e = t.g;
    if (e.g == e.l) return false;
    t.l = t.g.g;
    var n = Mn(t.g);
    if (((e = n >>> 3), !((n &= 7) >= 0 && n <= 5))) throw kn(n, t.l);
    if (e < 1) throw Error(`Invalid field number: ${e} (at position ${t.l})`);
    return ((t.m = e), (t.h = n), true);
  }
  function Vn(t) {
    switch (t.h) {
      case 0:
        0 != t.h ? Vn(t) : Fn(t.g);
        break;
      case 1:
        Dn((t = t.g), t.g + 8);
        break;
      case 2:
        if (2 != t.h) Vn(t);
        else {
          var e = Mn(t.g);
          Dn((t = t.g), t.g + e);
        }
        break;
      case 5:
        Dn((t = t.g), t.g + 4);
        break;
      case 3:
        for (e = t.m; ; ) {
          if (!jn(t)) throw Error("Unmatched start-group tag: stream EOF");
          if (4 == t.h) {
            if (t.m != e) throw Error("Unmatched end-group tag");
            break;
          }
          Vn(t);
        }
        break;
      default:
        throw kn(t.h, t.l);
    }
  }
  function Xn(t, e, n) {
    const r = t.g.l,
      i = Mn(t.g),
      s = t.g.g + i;
    let o = s - r;
    if (
      (o <= 0 &&
        ((t.g.l = s), n(e, t, void 0, void 0, void 0), (o = s - t.g.g)),
      o)
    )
      throw Error(
        `Message parsing ended unexpectedly. Expected to read ${i} bytes, instead read ${i - o} bytes, either the data ended unexpectedly or the message misreported its own length`
      );
    return ((t.g.g = s), (t.g.l = r), e);
  }
  function Hn(t) {
    var o = Mn(t.g),
      a = Nn((t = t.g), o);
    if (((t = t.h), s)) {
      var c,
        h = t;
      ((c = i) || (c = i = new TextDecoder("utf-8", { fatal: true })),
        (o = a + o),
        (h = 0 === a && o === h.length ? h : h.subarray(a, o)));
      try {
        var u = c.decode(h);
      } catch (t) {
        if (void 0 === r) {
          try {
            c.decode(new Uint8Array([128]));
          } catch (t) {}
          try {
            (c.decode(new Uint8Array([97])), (r = !0));
          } catch (t) {
            r = false;
          }
        }
        throw (!r && (i = void 0), t);
      }
    } else {
      ((o = (u = a) + o), (a = []));
      let r,
        i = null;
      for (; u < o; ) {
        var l = t[u++];
        (l < 128
          ? a.push(l)
          : l < 224
            ? u >= o
              ? e()
              : ((r = t[u++]),
                l < 194 || 128 != (192 & r)
                  ? (u--, e())
                  : a.push(((31 & l) << 6) | (63 & r)))
            : l < 240
              ? u >= o - 1
                ? e()
                : ((r = t[u++]),
                  128 != (192 & r) ||
                  (224 === l && r < 160) ||
                  (237 === l && r >= 160) ||
                  128 != (192 & (c = t[u++]))
                    ? (u--, e())
                    : a.push(((15 & l) << 12) | ((63 & r) << 6) | (63 & c)))
              : l <= 244
                ? u >= o - 2
                  ? e()
                  : ((r = t[u++]),
                    128 != (192 & r) ||
                    (r - 144 + (l << 28)) >> 30 != 0 ||
                    128 != (192 & (c = t[u++])) ||
                    128 != (192 & (h = t[u++]))
                      ? (u--, e())
                      : ((l =
                          ((7 & l) << 18) |
                          ((63 & r) << 12) |
                          ((63 & c) << 6) |
                          (63 & h)),
                        (l -= 65536),
                        a.push(55296 + ((l >> 10) & 1023), 56320 + (1023 & l))))
                : e(),
          a.length >= 8192 && ((i = n(i, a)), (a.length = 0)));
      }
      u = n(i, a);
    }
    return u;
  }
  function Wn(t) {
    const e = Mn(t.g);
    return Bn(t.g, e);
  }
  function zn(t, e, n) {
    var r = Mn(t.g);
    for (r = t.g.g + r; t.g.g < r; ) n.push(e(t.g));
  }
  var Kn = [];
  function Yn(t, e, n) {
    e.g ? e.m(t, e.g, e.h, n) : e.m(t, e.h, n);
  }
  var $n = class {
    constructor(t, e) {
      this.u = Ne(t, e);
    }
    toJSON() {
      try {
        var t = Ue(this);
      } finally {
        Le = void 0;
      }
      return t;
    }
    l() {
      var t = _o;
      return t.g ? t.l(this, t.g, t.h) : t.l(this, t.h, t.defaultValue);
    }
    clone() {
      const t = this.u;
      return new this.constructor(Ge(t, 0 | t[Q], false));
    }
    O() {
      return !!(2 & (0 | this.u[Q]));
    }
  };
  function qn(t) {
    return t
      ? /^\d+$/.test(t)
        ? (Vt(t), new Jn(Mt, Pt))
        : null
      : (Zn ||= new Jn(0, 0));
  }
  (($n.prototype.W = ut),
    ($n.prototype.toString = function () {
      return this.u.toString();
    }));
  var Jn = class {
    constructor(t, e) {
      ((this.h = t >>> 0), (this.g = e >>> 0));
    }
  };
  let Zn;
  function Qn(t) {
    return t
      ? /^-?\d+$/.test(t)
        ? (Vt(t), new tr(Mt, Pt))
        : null
      : (er ||= new tr(0, 0));
  }
  var tr = class {
    constructor(t, e) {
      ((this.h = t >>> 0), (this.g = e >>> 0));
    }
  };
  let er;
  function nr(t, e, n) {
    for (; n > 0 || e > 127; )
      (t.g.push((127 & e) | 128),
        (e = ((e >>> 7) | (n << 25)) >>> 0),
        (n >>>= 7));
    t.g.push(e);
  }
  function rr(t, e) {
    for (; e > 127; ) (t.g.push((127 & e) | 128), (e >>>= 7));
    t.g.push(e);
  }
  function ir(t, e) {
    if (e >= 0) rr(t, e);
    else {
      for (let n = 0; n < 9; n++) (t.g.push((127 & e) | 128), (e >>= 7));
      t.g.push(1);
    }
  }
  function sr(t, e) {
    (t.g.push((e >>> 0) & 255),
      t.g.push((e >>> 8) & 255),
      t.g.push((e >>> 16) & 255),
      t.g.push((e >>> 24) & 255));
  }
  function or(t, e) {
    0 !== e.length && (t.l.push(e), (t.h += e.length));
  }
  function ar(t, e, n) {
    rr(t.g, 8 * e + n);
  }
  function cr(t, e) {
    return (ar(t, e, 2), (e = t.g.end()), or(t, e), e.push(t.h), e);
  }
  function hr(t, e) {
    var n = e.pop();
    for (n = t.h + t.g.length() - n; n > 127; )
      (e.push((127 & n) | 128), (n >>>= 7), t.h++);
    (e.push(n), t.h++);
  }
  function ur(t, e, n) {
    (ar(t, e, 2), rr(t.g, n.length), or(t, t.g.end()), or(t, n));
  }
  function lr(t, e, n, r) {
    null != n && ((e = cr(t, e)), r(n, t), hr(t, e));
  }
  function dr() {
    const t = class {
      constructor() {
        throw Error();
      }
    };
    return (Object.setPrototypeOf(t, t.prototype), t);
  }
  var fr = dr(),
    pr = dr(),
    gr = dr(),
    mr = dr(),
    yr = dr(),
    _r = dr(),
    vr = dr(),
    Er = dr(),
    wr = dr(),
    Tr = class {
      constructor(t, e, n) {
        ((this.g = t),
          (this.h = e),
          (t = fr),
          (this.l = (!!t && n === t) || false));
      }
    };
  function Ar(t, e) {
    return new Tr(t, e, fr);
  }
  function br(t, e, n, r, i) {
    lr(t, n, Or(e, r), i);
  }
  const kr = Ar(function (t, e, n, r, i) {
      return 2 === t.h && (Xn(t, an(e, r, n), i), true);
    }, br),
    Sr = Ar(function (t, e, n, r, i) {
      return 2 === t.h && (Xn(t, an(e, r, n), i), true);
    }, br);
  var xr = Symbol(),
    Lr = Symbol(),
    Rr = Symbol(),
    Fr = Symbol();
  let Ir, Mr;
  function Pr(t, e, n, r) {
    var i = r[t];
    if (i) return i;
    (((i = {}).Ma = r),
      (i.T = (function (t) {
        switch (typeof t) {
          case "boolean":
            return (Re ||= [0, void 0, true]);
          case "number":
            return t > 0
              ? void 0
              : 0 === t
                ? (Fe ||= [0, void 0])
                : [-t, void 0];
          case "string":
            return [0, t];
          case "object":
            return t;
        }
      })(r[0])));
    var s = r[1];
    let o = 1;
    s &&
      s.constructor === Object &&
      ((i.ga = s),
      "function" == typeof (s = r[++o]) &&
        ((i.la = true), (Ir ??= s), (Mr ??= r[o + 1]), (s = r[(o += 2)])));
    const a = {};
    for (
      ;
      s && Array.isArray(s) && s.length && "number" == typeof s[0] && s[0] > 0;

    ) {
      for (var c = 0; c < s.length; c++) a[s[c]] = s;
      s = r[++o];
    }
    for (c = 1; void 0 !== s; ) {
      let t;
      "number" == typeof s && ((c += s), (s = r[++o]));
      var h = void 0;
      if ((s instanceof Tr ? (t = s) : ((t = kr), o--), t?.l)) {
        ((s = r[++o]), (h = r));
        var u = o;
        ("function" == typeof s && ((s = s()), (h[u] = s)), (h = s));
      }
      for (
        u = c + 1,
          "number" == typeof (s = r[++o]) && s < 0 && ((u -= s), (s = r[++o]));
        c < u;
        c++
      ) {
        const r = a[c];
        h ? n(i, c, t, h, r) : e(i, c, t, r);
      }
    }
    return (r[t] = i);
  }
  function Cr(t) {
    return Array.isArray(t) ? (t[0] instanceof Tr ? t : [Sr, t]) : [t, void 0];
  }
  function Or(t, e) {
    return t instanceof $n ? t.u : Array.isArray(t) ? De(t, e, false) : void 0;
  }
  function Ur(t, e, n, r) {
    const i = n.g;
    t[e] = r ? (t, e, n) => i(t, e, n, r) : i;
  }
  function Dr(t, e, n, r, i) {
    const s = n.g;
    let o, a;
    t[e] = (t, e, n) =>
      s(t, e, n, (a ||= Pr(Lr, Ur, Dr, r).T), (o ||= Nr(r)), i);
  }
  function Nr(t) {
    let e = t[Rr];
    if (null != e) return e;
    const n = Pr(Lr, Ur, Dr, t);
    return (
      (e = n.la
        ? (t, e) => Ir(t, e, n)
        : (t, e) => {
            const r = 0 | t[Q];
            for (; jn(e) && 4 != e.h; ) {
              var i = e.m,
                s = n[i];
              if (null == s) {
                var o = n.ga;
                o && (o = o[i]) && null != (o = Br(o)) && (s = n[i] = o);
              }
              (null != s && s(e, t, i)) ||
                ((i = (s = e).l),
                Vn(s),
                s.fa
                  ? (s = void 0)
                  : ((o = s.g.g - i), (s.g.g = i), (s = Bn(s.g, o))),
                (i = t),
                s && ((o = i[q]) ? o.push(s) : (i[q] = [s])));
            }
            return (8192 & r && it(t), true);
          }),
      (t[Rr] = e)
    );
  }
  function Br(t) {
    const e = (t = Cr(t))[0].g;
    if ((t = t[1])) {
      const n = Nr(t),
        r = Pr(Lr, Ur, Dr, t).T;
      return (t, i, s) => e(t, i, s, r, n);
    }
    return e;
  }
  function Gr(t, e, n) {
    t[e] = n.h;
  }
  function jr(t, e, n, r) {
    let i, s;
    const o = n.h;
    t[e] = (t, e, n) => o(t, e, n, (s ||= Pr(xr, Gr, jr, r).T), (i ||= Vr(r)));
  }
  function Vr(t) {
    let e = t[Fr];
    if (!e) {
      const n = Pr(xr, Gr, jr, t);
      ((e = (t, e) => Xr(t, e, n)), (t[Fr] = e));
    }
    return e;
  }
  function Xr(t, e, n) {
    (!(function (t, e, n) {
      const r = 512 & e ? 0 : -1,
        i = t.length,
        s = i + ((e = 64 & e ? 256 & e : !!i && lt(t[i - 1])) ? -1 : 0);
      for (let e = 0; e < s; e++) n(e - r, t[e]);
      if (e) {
        t = t[i - 1];
        for (const e in t) !isNaN(e) && n(+e, t[e]);
      }
    })(t, 0 | t[Q] | (n.T[1] ? 512 : 0), (t, r) => {
      if (null != r) {
        var i = (function (t, e) {
          var n = t[e];
          if (n) return n;
          if ((n = t.ga) && (n = n[e])) {
            var r = (n = Cr(n))[0].h;
            if ((n = n[1])) {
              const e = Vr(n),
                i = Pr(xr, Gr, jr, n).T;
              n = t.la ? Mr(i, e) : (t, n, s) => r(t, n, s, i, e);
            } else n = r;
            return (t[e] = n);
          }
        })(n, t);
        i && i(e, r, t);
      }
    }),
      (t = mt(t)) &&
        (function (t, e) {
          or(t, t.g.end());
          for (let n = 0; n < e.length; n++)
            or(t, D(e[n]) || new Uint8Array(0));
        })(e, t));
  }
  function Hr(t, e) {
    if (Array.isArray(e)) {
      var n = 0 | e[Q];
      if (4 & n) return e;
      for (var r = 0, i = 0; r < e.length; r++) {
        const n = t(e[r]);
        null != n && (e[i++] = n);
      }
      return (
        i < r && (e.length = i),
        rt(e, -6145 & (5 | n)),
        2 & n && Object.freeze(e),
        e
      );
    }
  }
  function Wr(t, e, n) {
    return new Tr(t, e, n);
  }
  function zr(t, e, n) {
    return new Tr(t, e, n);
  }
  function Kr(t, e, n) {
    We(t, 0 | t[Q], e, n);
  }
  var Yr = Ar(
    function (t, e, n, r, i) {
      return (
        2 === t.h &&
        ((t = Xn(t, De([void 0, void 0], r, true), i)),
        pt((r = 0 | e[Q])),
        (i = Xe(e, r, n)) instanceof Ae
          ? 0 != (2 & i.M)
            ? ((i = i.da()).push(t), We(e, r, n, i))
            : i.Ja(t)
          : Array.isArray(i)
            ? (2 & (0 | i[Q]) && We(e, r, n, (i = Qe(i))), i.push(t))
            : We(e, r, n, [t]),
        true)
      );
    },
    function (t, e, n, r, i) {
      if (e instanceof Ae)
        e.forEach((e, s) => {
          lr(t, n, De([s, e], r, false), i);
        });
      else if (Array.isArray(e))
        for (let s = 0; s < e.length; s++) {
          const o = e[s];
          Array.isArray(o) && lr(t, n, De(o, r, false), i);
        }
    }
  );
  function $r(t, e, n) {
    if (
      ((e = (function (t) {
        if (null == t) return t;
        const e = typeof t;
        if ("bigint" === e) return String(Ht(64, t));
        if (Qt(t)) {
          if ("string" === e) return oe(t);
          if ("number" === e) return se(t);
        }
      })(e)),
      null != e)
    ) {
      if ("string" == typeof e) Qn(e);
      if (null != e)
        switch ((ar(t, n, 0), typeof e)) {
          case "number":
            ((t = t.g), Ot(e), nr(t, Mt, Pt));
            break;
          case "bigint":
            ((n = BigInt.asUintN(64, e)),
              (n = new tr(
                Number(n & BigInt(4294967295)),
                Number(n >> BigInt(32))
              )),
              nr(t.g, n.h, n.g));
            break;
          default:
            ((n = Qn(e)), nr(t.g, n.h, n.g));
        }
    }
  }
  function qr(t, e, n) {
    null != (e = te(e)) && null != e && (ar(t, n, 0), ir(t.g, e));
  }
  function Jr(t, e, n) {
    null != (e = Jt(e)) && (ar(t, n, 0), t.g.g.push(e ? 1 : 0));
  }
  function Zr(t, e, n) {
    null != (e = fe(e)) && ur(t, n, c(e));
  }
  function Qr(t, e, n, r, i) {
    lr(t, n, Or(e, r), i);
  }
  function ti(t, e, n) {
    (null == e ||
      "string" == typeof e ||
      e instanceof N ||
      (C(e) ? C(e) && H(Z) : (e = void 0)),
      null != e && ur(t, n, Ln(e).buffer));
  }
  function ei(t, e, n) {
    return (
      (5 === t.h || 2 === t.h) &&
      ((e = en(e, 0 | e[Q], n, false)),
      2 == t.h ? zn(t, Cn, e) : e.push(Cn(t.g)),
      true)
    );
  }
  var ni = Wr(
      function (t, e, n) {
        if (1 !== t.h) return false;
        var r = t.g;
        t = Pn(r);
        const i = Pn(r);
        r = 2 * (i >> 31) + 1;
        const s = (i >>> 20) & 2047;
        return (
          (t = 4294967296 * (1048575 & i) + t),
          Kr(
            e,
            n,
            2047 == s
              ? t
                ? NaN
                : r * (1 / 0)
              : 0 == s
                ? 5e-324 * r * t
                : r * Math.pow(2, s - 1075) * (t + 4503599627370496)
          ),
          true
        );
      },
      function (t, e, n) {
        null != (e = qt(e)) &&
          (ar(t, n, 1),
          (t = t.g),
          (n = It ||= new DataView(new ArrayBuffer(8))).setFloat64(0, +e, true),
          (Mt = n.getUint32(0, true)),
          (Pt = n.getUint32(4, true)),
          sr(t, Mt),
          sr(t, Pt));
      },
      dr()
    ),
    ri = Wr(
      function (t, e, n) {
        return 5 === t.h && (Kr(e, n, Cn(t.g)), true);
      },
      function (t, e, n) {
        null != (e = qt(e)) && (ar(t, n, 5), (t = t.g), Ut(e), sr(t, Mt));
      },
      vr
    ),
    ii = zr(
      ei,
      function (t, e, n) {
        if (null != (e = Hr(qt, e)))
          for (let o = 0; o < e.length; o++) {
            var r = t,
              i = n,
              s = e[o];
            null != s && (ar(r, i, 5), (r = r.g), Ut(s), sr(r, Mt));
          }
      },
      vr
    ),
    si = zr(
      ei,
      function (t, e, n) {
        if (null != (e = Hr(qt, e)) && e.length) {
          (ar(t, n, 2), rr(t.g, 4 * e.length));
          for (let r = 0; r < e.length; r++) ((n = t.g), Ut(e[r]), sr(n, Mt));
        }
      },
      vr
    ),
    oi = Wr(
      function (t, e, n) {
        return 0 === t.h && (Kr(e, n, Rn(t.g, Nt)), true);
      },
      $r,
      _r
    ),
    ai = Wr(
      function (t, e, n) {
        return (
          0 === t.h && (Kr(e, n, 0 === (t = Rn(t.g, Nt)) ? void 0 : t), true)
        );
      },
      $r,
      _r
    ),
    ci = Wr(
      function (t, e, n) {
        return 0 === t.h && (Kr(e, n, Rn(t.g, Dt)), true);
      },
      function (t, e, n) {
        if (null != (e = ue(e))) {
          if ("string" == typeof e) qn(e);
          if (null != e)
            switch ((ar(t, n, 0), typeof e)) {
              case "number":
                ((t = t.g), Ot(e), nr(t, Mt, Pt));
                break;
              case "bigint":
                ((n = BigInt.asUintN(64, e)),
                  (n = new Jn(
                    Number(n & BigInt(4294967295)),
                    Number(n >> BigInt(32))
                  )),
                  nr(t.g, n.h, n.g));
                break;
              default:
                ((n = qn(e)), nr(t.g, n.h, n.g));
            }
        }
      },
      dr()
    ),
    hi = Wr(
      function (t, e, n) {
        return 0 === t.h && (Kr(e, n, In(t.g)), true);
      },
      qr,
      mr
    ),
    ui = zr(
      function (t, e, n) {
        return (
          (0 === t.h || 2 === t.h) &&
          ((e = en(e, 0 | e[Q], n, false)),
          2 == t.h ? zn(t, In, e) : e.push(In(t.g)),
          true)
        );
      },
      function (t, e, n) {
        if (null != (e = Hr(te, e)) && e.length) {
          n = cr(t, n);
          for (let n = 0; n < e.length; n++) ir(t.g, e[n]);
          hr(t, n);
        }
      },
      mr
    ),
    li = Wr(
      function (t, e, n) {
        return 0 === t.h && (Kr(e, n, 0 === (t = In(t.g)) ? void 0 : t), true);
      },
      qr,
      mr
    ),
    di = Wr(
      function (t, e, n) {
        return 0 === t.h && (Kr(e, n, Fn(t.g)), true);
      },
      Jr,
      pr
    ),
    fi = Wr(
      function (t, e, n) {
        return (
          0 === t.h && (Kr(e, n, false === (t = Fn(t.g)) ? void 0 : t), true)
        );
      },
      Jr,
      pr
    ),
    pi = zr(
      function (t, e, n) {
        return (
          2 === t.h && ((t = Hn(t)), en(e, 0 | e[Q], n, false).push(t), true)
        );
      },
      function (t, e, n) {
        if (null != (e = Hr(fe, e)))
          for (let o = 0; o < e.length; o++) {
            var r = t,
              i = n,
              s = e[o];
            null != s && ur(r, i, c(s));
          }
      },
      gr
    ),
    gi = Wr(
      function (t, e, n) {
        return 2 === t.h && (Kr(e, n, "" === (t = Hn(t)) ? void 0 : t), true);
      },
      Zr,
      gr
    ),
    mi = Wr(
      function (t, e, n) {
        return 2 === t.h && (Kr(e, n, Hn(t)), true);
      },
      Zr,
      gr
    ),
    yi = (function (t, e, n = fr) {
      return new Tr(t, e, n);
    })(
      function (t, e, n, r, i) {
        return (
          2 === t.h &&
          ((r = De(void 0, r, true)),
          en(e, 0 | e[Q], n, true).push(r),
          Xn(t, r, i),
          true)
        );
      },
      function (t, e, n, r, i) {
        if (Array.isArray(e))
          for (let s = 0; s < e.length; s++) Qr(t, e[s], n, r, i);
      }
    ),
    _i = Ar(function (t, e, n, r, i, s) {
      return (
        2 === t.h && (sn(e, 0 | e[Q], s, n), Xn(t, (e = an(e, r, n)), i), true)
      );
    }, Qr),
    vi = Wr(
      function (t, e, n) {
        return 2 === t.h && (Kr(e, n, Wn(t)), true);
      },
      ti,
      Er
    ),
    Ei = zr(
      function (t, e, n) {
        return (
          (0 === t.h || 2 === t.h) &&
          ((e = en(e, 0 | e[Q], n, false)),
          2 == t.h ? zn(t, Mn, e) : e.push(Mn(t.g)),
          true)
        );
      },
      function (t, e, n) {
        if (null != (e = Hr(ee, e)))
          for (let o = 0; o < e.length; o++) {
            var r = t,
              i = n,
              s = e[o];
            null != s && (ar(r, i, 0), rr(r.g, s));
          }
      },
      yr
    ),
    wi = Wr(
      function (t, e, n) {
        return 0 === t.h && (Kr(e, n, 0 === (t = Mn(t.g)) ? void 0 : t), true);
      },
      function (t, e, n) {
        null != (e = ee(e)) && null != e && (ar(t, n, 0), rr(t.g, e));
      },
      yr
    ),
    Ti = Wr(
      function (t, e, n) {
        return 0 === t.h && (Kr(e, n, In(t.g)), true);
      },
      function (t, e, n) {
        null != (e = te(e)) && ((e = parseInt(e, 10)), ar(t, n, 0), ir(t.g, e));
      },
      wr
    );
  class Ai {
    constructor(t, e) {
      ((this.h = t),
        (this.g = e),
        (this.l = hn),
        (this.m = dn),
        (this.defaultValue = void 0));
    }
    register() {
      w(this);
    }
  }
  function bi(t, e) {
    return new Ai(t, e);
  }
  function ki(t, e) {
    return (n, r) => {
      if (Kn.length) {
        const t = Kn.pop();
        (t.o(r), Un(t.g, n, r), (n = t));
      } else
        n = new (class {
          constructor(t, e) {
            if (Gn.length) {
              const n = Gn.pop();
              (Un(n, t, e), (t = n));
            } else
              t = new (class {
                constructor(t, e) {
                  ((this.h = null),
                    (this.m = false),
                    (this.g = this.l = this.j = 0),
                    Un(this, t, e));
                }
                clear() {
                  ((this.h = null),
                    (this.m = false),
                    (this.g = this.l = this.j = 0),
                    (this.aa = false));
                }
              })(t, e);
            ((this.g = t),
              (this.l = this.g.g),
              (this.h = this.m = -1),
              this.o(e));
          }
          o({ fa: t = false } = {}) {
            this.fa = t;
          }
        })(n, r);
      try {
        const r = new t(),
          s = r.u;
        Nr(e)(s, n);
        var i = r;
      } finally {
        (n.g.clear(), (n.m = -1), (n.h = -1), Kn.length < 100 && Kn.push(n));
      }
      return i;
    };
  }
  function Si(t) {
    return function () {
      const e = new (class {
        constructor() {
          ((this.l = []),
            (this.h = 0),
            (this.g = new (class {
              constructor() {
                this.g = [];
              }
              length() {
                return this.g.length;
              }
              end() {
                const t = this.g;
                return ((this.g = []), t);
              }
            })()));
        }
      })();
      (Xr(this.u, e, Pr(xr, Gr, jr, t)), or(e, e.g.end()));
      const n = new Uint8Array(e.h),
        r = e.l,
        i = r.length;
      let s = 0;
      for (let t = 0; t < i; t++) {
        const e = r[t];
        (n.set(e, s), (s += e.length));
      }
      return ((e.l = [n]), n);
    };
  }
  var xi = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Li = [
      0,
      gi,
      Wr(
        function (t, e, n) {
          return (
            2 === t.h && (Kr(e, n, (t = Wn(t)) === U() ? void 0 : t), true)
          );
        },
        function (t, e, n) {
          if (null != e) {
            if (e instanceof $n) {
              const r = e.Oa;
              return void (
                r && ((e = r(e)), null != e && ur(t, n, Ln(e).buffer))
              );
            }
            if (Array.isArray(e)) return;
          }
          ti(t, e, n);
        },
        Er
      ),
    ];
  let Ri,
    Fi = globalThis.trustedTypes;
  function Ii(t) {
    void 0 === Ri &&
      (Ri = (function () {
        let t = null;
        if (!Fi) return t;
        try {
          const e = (t) => t;
          t = Fi.createPolicy("goog#html", {
            createHTML: e,
            createScript: e,
            createScriptURL: e,
          });
        } catch (t) {}
        return t;
      })());
    var e = Ri;
    return new (class {
      constructor(t) {
        this.g = t;
      }
      toString() {
        return this.g + "";
      }
    })(e ? e.createScriptURL(t) : t);
  }
  function Mi(t, ...e) {
    if (0 === e.length) return Ii(t[0]);
    let n = t[0];
    for (let r = 0; r < e.length; r++) n += encodeURIComponent(e[r]) + t[r + 1];
    return Ii(n);
  }
  var Pi = [0, hi, Ti, di, -1, ui, Ti, -1],
    Ci = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Oi = [
      0,
      di,
      mi,
      di,
      Ti,
      -1,
      zr(
        function (t, e, n) {
          return (
            (0 === t.h || 2 === t.h) &&
            ((e = en(e, 0 | e[Q], n, false)),
            2 == t.h ? zn(t, On, e) : e.push(In(t.g)),
            true)
          );
        },
        function (t, e, n) {
          if (null != (e = Hr(te, e)) && e.length) {
            n = cr(t, n);
            for (let n = 0; n < e.length; n++) ir(t.g, e[n]);
            hr(t, n);
          }
        },
        wr
      ),
      mi,
      -1,
      [0, di, -1],
      Ti,
      di,
      -1,
    ],
    Ui = [0, mi, -2],
    Di = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Ni = [0],
    Bi = [0, hi, di, 1, di, -3],
    Gi = class extends $n {
      constructor(t) {
        super(t, 2);
      }
    },
    ji = {};
  ji[336783863] = [
    0,
    mi,
    di,
    -1,
    hi,
    [
      0,
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      _i,
      Ni,
      _i,
      Oi,
      _i,
      Ui,
      _i,
      Bi,
      _i,
      Pi,
      _i,
      [0, mi, -2],
      _i,
      [0, mi, Ti],
      _i,
      [0, Ti, mi, -1],
      _i,
      [0, Ti, -1],
    ],
    [0, mi],
    di,
    [0, [1, 3], [2, 4], _i, [0, ui], -1, _i, [0, pi], -1, yi, [0, mi, -1]],
    mi,
  ];
  var Vi = [0, ai, -1, fi, -3, ai, ui, gi, li, ai, -1, fi, li, fi, -2, gi];
  function Xi(t, e) {
    tn(t, 2, de(e), "");
  }
  function Hi(t, e) {
    mn(t, 3, e);
  }
  function Wi(t, e) {
    mn(t, 4, e);
  }
  var zi = class extends $n {
      constructor(t) {
        super(t, 500);
      }
      o(t) {
        return dn(this, 0, 7, t);
      }
    },
    Ki = [-1, {}],
    Yi = [0, mi, 1, Ki],
    $i = [0, mi, pi, Ki];
  function qi(t, e) {
    yn(t, 1, zi, e);
  }
  function Ji(t, e) {
    mn(t, 10, e);
  }
  function Zi(t, e) {
    mn(t, 15, e);
  }
  var Qi = class extends $n {
      constructor(t) {
        super(t, 500);
      }
      o(t) {
        return dn(this, 0, 1001, t);
      }
    },
    ts = [
      -500,
      yi,
      [
        -500,
        gi,
        -1,
        pi,
        -3,
        [-2, ji, di],
        yi,
        Li,
        li,
        -1,
        Yi,
        $i,
        yi,
        [0, gi, fi],
        gi,
        Vi,
        li,
        pi,
        987,
        pi,
      ],
      4,
      yi,
      [-500, mi, -1, [-1, {}], 998, mi],
      yi,
      [-500, mi, pi, -1, [-2, {}, di], 997, pi, -1],
      li,
      yi,
      [-500, mi, pi, Ki, 998, pi],
      pi,
      li,
      Yi,
      $i,
      yi,
      [0, gi, -1, Ki],
      pi,
      -2,
      Vi,
      gi,
      -1,
      fi,
      [0, fi, wi],
      978,
      Ki,
      yi,
      Li,
    ];
  Qi.prototype.g = Si(ts);
  var es = ki(Qi, ts),
    ns = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    rs = class extends $n {
      constructor(t) {
        super(t);
      }
      g() {
        return ln(this, ns, 1);
      }
    },
    is = [0, yi, [0, hi, ri, mi, -1]],
    ss = ki(rs, is),
    os = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    as = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    cs = class extends $n {
      constructor(t) {
        super(t);
      }
      h() {
        return hn(this, os, 2);
      }
      g() {
        return ln(this, as, 5);
      }
    },
    hs = ki(
      class extends $n {
        constructor(t) {
          super(t);
        }
      },
      [
        0,
        pi,
        ui,
        si,
        [
          0,
          Ti,
          [0, hi, -3],
          [0, ri, -3],
          [0, hi, -1, [0, yi, [0, hi, -2]]],
          yi,
          [0, ri, -1, mi, ri],
        ],
        mi,
        -1,
        oi,
        yi,
        [0, hi, ri],
        pi,
        oi,
      ]
    ),
    us = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    ls = ki(
      class extends $n {
        constructor(t) {
          super(t);
        }
      },
      [0, yi, [0, ri, -4]]
    ),
    ds = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    fs = ki(
      class extends $n {
        constructor(t) {
          super(t);
        }
      },
      [0, yi, [0, ri, -4]]
    ),
    ps = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    gs = [0, hi, -1, si, Ti],
    ms = class extends $n {
      constructor(t) {
        super(t);
      }
    };
  ms.prototype.g = Si([0, ri, -4, oi]);
  var ys = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    _s = ki(
      class extends $n {
        constructor(t) {
          super(t);
        }
      },
      [0, yi, [0, 1, hi, mi, is], oi]
    ),
    vs = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Es = class extends $n {
      constructor(t) {
        super(t);
      }
      ma() {
        const t = Ke(this);
        return null == t ? U() : t;
      }
    },
    ws = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Ts = [1, 2],
    As = ki(
      class extends $n {
        constructor(t) {
          super(t);
        }
      },
      [0, yi, [0, Ts, _i, [0, si], _i, [0, vi], hi, mi], oi]
    ),
    bs = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    ks = [0, mi, hi, ri, pi, -1],
    Ss = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    xs = [0, di, -1],
    Ls = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Rs = [1, 2, 3, 4, 5],
    Fs = class extends $n {
      constructor(t) {
        super(t);
      }
      g() {
        return null != Ke(this);
      }
      h() {
        return null != vn(this, 2);
      }
    },
    Is = class extends $n {
      constructor(t) {
        super(t);
      }
      g() {
        return Jt(Ve(this, 2)) ?? false;
      }
    },
    Ms = [0, vi, mi, [0, hi, oi, -1], [0, ci, oi]],
    Ps = [0, Ms, di, [0, Rs, _i, Bi, _i, Oi, _i, Pi, _i, Ni, _i, Ui], Ti],
    Cs = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Os = [0, Ps, ri, -1, hi],
    Us = bi(502141897, Cs);
  ji[502141897] = Os;
  var Ds = ki(
      class extends $n {
        constructor(t) {
          super(t);
        }
      },
      [0, [0, Ti, -1, ii, Ei], gs]
    ),
    Ns = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Bs = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Gs = [0, Ps, ri, [0, Ps], di],
    js = [0, Ps, Os, Gs, ri, [0, [0, Ms]]],
    Vs = bi(508968150, Bs);
  ((ji[508968150] = js), (ji[508968149] = Gs));
  var Xs = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Hs = bi(513916220, Xs);
  ji[513916220] = [0, Ps, js, hi];
  var Ws = class extends $n {
      constructor(t) {
        super(t);
      }
      h() {
        return hn(this, bs, 2);
      }
      g() {
        He(this, 2);
      }
    },
    zs = [0, Ps, ks];
  ji[478825465] = zs;
  var Ks = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Ys = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    $s = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    qs = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Js = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Zs = [0, Ps, [0, Ps], zs, -1],
    Qs = [0, Ps, ri, hi],
    to = [0, Ps, ri],
    eo = [0, Ps, Qs, to, ri],
    no = bi(479097054, Js);
  ((ji[479097054] = [0, Ps, eo, Zs]),
    (ji[463370452] = Zs),
    (ji[464864288] = Qs));
  var ro = bi(462713202, qs);
  ((ji[462713202] = eo), (ji[474472470] = to));
  var io = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    so = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    oo = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    ao = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    co = [0, Ps, ri, -1, hi],
    ho = [0, Ps, ri, di];
  ao.prototype.g = Si([0, Ps, to, [0, Ps], Os, Gs, co, ho]);
  var uo = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    lo = bi(456383383, uo);
  ji[456383383] = [0, Ps, ks];
  var fo = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    po = bi(476348187, fo);
  ji[476348187] = [0, Ps, xs];
  var go = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    mo = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    yo = [0, Ti, -1],
    _o = bi(
      458105876,
      class extends $n {
        constructor(t) {
          super(t);
        }
        g() {
          var t = this.u;
          const e = 0 | t[Q],
            n = 2 & e;
          return (
            (t = (function (t, e, n) {
              var r = mo;
              const i = 2 & e;
              let s = false;
              if (null == n) {
                if (i) return Ie();
                n = [];
              } else if (n.constructor === Ae) {
                if (0 == (2 & n.M) || i) return n;
                n = n.da();
              } else Array.isArray(n) ? (s = !!(2 & (0 | n[Q]))) : (n = []);
              if (i) {
                if (!n.length) return Ie();
                s || ((s = true), it(n));
              } else s && ((s = false), (n = Qe(n)));
              return (
                s || (64 & (0 | n[Q]) ? (n[Q] &= -33) : 32 & e && nt(n, 32)),
                We(t, e, 2, (r = new Ae(n, r, ge, void 0))),
                r
              );
            })(t, e, Xe(t, e, 2))),
            !n && mo && (t.pa = true),
            t
          );
        }
      }
    );
  ji[458105876] = [0, yo, Yr, [true, oi, [0, mi, -1, pi]]];
  var vo = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Eo = bi(458105758, vo);
  ji[458105758] = [0, Ps, mi, yo];
  var wo = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    To = bi(443442058, wo);
  ((ji[443442058] = [0, Ps, mi, hi, ri, pi, -1, di, ri]), (ji[514774813] = co));
  var Ao = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    bo = bi(516587230, Ao);
  function ko(t, e) {
    return (
      (e = e ? e.clone() : new bs()),
      void 0 !== t.displayNamesLocale
        ? He(e, 1, de(t.displayNamesLocale))
        : void 0 === t.displayNamesLocale && He(e, 1),
      void 0 !== t.maxResults
        ? Tn(e, 2, t.maxResults)
        : "maxResults" in t && He(e, 2),
      void 0 !== t.scoreThreshold
        ? An(e, 3, t.scoreThreshold)
        : "scoreThreshold" in t && He(e, 3),
      void 0 !== t.categoryAllowlist
        ? bn(e, 4, t.categoryAllowlist)
        : "categoryAllowlist" in t && He(e, 4),
      void 0 !== t.categoryDenylist
        ? bn(e, 5, t.categoryDenylist)
        : "categoryDenylist" in t && He(e, 5),
      e
    );
  }
  function So(t, e = -1, n = "") {
    return {
      categories: t.map((t) => ({
        index: _n(t, 1) ?? 0 ?? -1,
        score: En(t, 2) ?? 0,
        categoryName: vn(t, 3) ?? "" ?? "",
        displayName: vn(t, 4) ?? "" ?? "",
      })),
      headIndex: e,
      headName: n,
    };
  }
  function xo(t) {
    var e = $e(t, 3, qt, Ye()),
      n = $e(t, 2, te, Ye()),
      r = $e(t, 1, fe, Ye()),
      i = $e(t, 9, fe, Ye());
    const s = { categories: [], keypoints: [] };
    for (let t = 0; t < e.length; t++)
      s.categories.push({
        score: e[t],
        index: n[t] ?? -1,
        categoryName: r[t] ?? "",
        displayName: i[t] ?? "",
      });
    if (
      ((e = hn(t, cs, 4)?.h()) &&
        (s.boundingBox = {
          originX: _n(e, 1) ?? 0,
          originY: _n(e, 2) ?? 0,
          width: _n(e, 3) ?? 0,
          height: _n(e, 4) ?? 0,
          angle: 0,
        }),
      hn(t, cs, 4)?.g().length)
    )
      for (const e of hn(t, cs, 4).g())
        s.keypoints.push({
          x: ze(e, 1) ?? 0,
          y: ze(e, 2) ?? 0,
          score: ze(e, 4) ?? 0,
          label: vn(e, 3) ?? "",
        });
    return s;
  }
  function Lo(t) {
    const e = [];
    for (const n of ln(t, ds, 1))
      e.push({
        x: En(n, 1) ?? 0,
        y: En(n, 2) ?? 0,
        z: En(n, 3) ?? 0,
        visibility: En(n, 4) ?? 0,
      });
    return e;
  }
  function Ro(t) {
    const e = [];
    for (const n of ln(t, us, 1))
      e.push({
        x: En(n, 1) ?? 0,
        y: En(n, 2) ?? 0,
        z: En(n, 3) ?? 0,
        visibility: En(n, 4) ?? 0,
      });
    return e;
  }
  function Fo(t) {
    return Array.from(t, (t) => (t > 127 ? t - 256 : t));
  }
  function Io(t, e) {
    if (t.length !== e.length)
      throw Error(
        `Cannot compute cosine similarity between embeddings of different sizes (${t.length} vs. ${e.length}).`
      );
    let n = 0,
      r = 0,
      i = 0;
    for (let s = 0; s < t.length; s++)
      ((n += t[s] * e[s]), (r += t[s] * t[s]), (i += e[s] * e[s]));
    if (r <= 0 || i <= 0)
      throw Error("Cannot compute cosine similarity on embedding with 0 norm.");
    return n / Math.sqrt(r * i);
  }
  let Mo;
  ((ji[516587230] = [0, Ps, co, ho, ri]), (ji[518928384] = ho));
  const Po = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
    8, 0, 65, 0, 253, 15, 253, 98, 11,
  ]);
  async function Co() {
    if (void 0 === Mo)
      try {
        (await WebAssembly.instantiate(Po), (Mo = !0));
      } catch {
        Mo = false;
      }
    return Mo;
  }
  async function Oo(t, e = Mi``) {
    const n = (await Co()) ? "wasm_internal" : "wasm_nosimd_internal";
    return {
      wasmLoaderPath: `${e}/${t}_${n}.js`,
      wasmBinaryPath: `${e}/${t}_${n}.wasm`,
    };
  }
  var Uo = class {};
  function Do() {
    var t = navigator;
    return (
      "undefined" != typeof OffscreenCanvas &&
      (!(function (t = navigator) {
        return (t = t.userAgent).includes("Safari") && !t.includes("Chrome");
      })(t) ||
        !!(
          (t = t.userAgent.match(/Version\/([\d]+).*Safari/)) &&
          t.length >= 1 &&
          Number(t[1]) >= 17
        ))
    );
  }
  async function No(t) {
    if ("function" != typeof importScripts) {
      const e = document.createElement("script");
      return (
        (e.src = t.toString()),
        (e.crossOrigin = "anonymous"),
        new Promise((t, n) => {
          (e.addEventListener(
            "load",
            () => {
              t();
            },
            false
          ),
            e.addEventListener(
              "error",
              (t) => {
                n(t);
              },
              false
            ),
            document.body.appendChild(e));
        })
      );
    }
    importScripts(t.toString());
  }
  function Bo(t) {
    return void 0 !== t.videoWidth
      ? [t.videoWidth, t.videoHeight]
      : void 0 !== t.naturalWidth
        ? [t.naturalWidth, t.naturalHeight]
        : void 0 !== t.displayWidth
          ? [t.displayWidth, t.displayHeight]
          : [t.width, t.height];
  }
  function Go(t, e, n) {
    (t.m ||
      console.error(
        "No wasm multistream support detected: ensure dependency inclusion of :gl_graph_runner_internal_multi_input target"
      ),
      n((e = t.i.stringToNewUTF8(e))),
      t.i._free(e));
  }
  function jo(t, e, n) {
    if (!t.i.canvas) throw Error("No OpenGL canvas configured.");
    if (
      (n ? t.i._bindTextureToStream(n) : t.i._bindTextureToCanvas(),
      !(n = t.i.canvas.getContext("webgl2") || t.i.canvas.getContext("webgl")))
    )
      throw Error(
        "Failed to obtain WebGL context from the provided canvas. `getContext()` should only be invoked with `webgl` or `webgl2`."
      );
    (t.i.gpuOriginForWebTexturesIsBottomLeft &&
      n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL, true),
      n.texImage2D(n.TEXTURE_2D, 0, n.RGBA, n.RGBA, n.UNSIGNED_BYTE, e),
      t.i.gpuOriginForWebTexturesIsBottomLeft &&
        n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL, false));
    const [r, i] = Bo(e);
    return (
      !t.l ||
        (r === t.i.canvas.width && i === t.i.canvas.height) ||
        ((t.i.canvas.width = r), (t.i.canvas.height = i)),
      [r, i]
    );
  }
  function Vo(t, e, n) {
    t.m ||
      console.error(
        "No wasm multistream support detected: ensure dependency inclusion of :gl_graph_runner_internal_multi_input target"
      );
    const r = new Uint32Array(e.length);
    for (let n = 0; n < e.length; n++) r[n] = t.i.stringToNewUTF8(e[n]);
    ((e = t.i._malloc(4 * r.length)), t.i.HEAPU32.set(r, e >> 2), n(e));
    for (const e of r) t.i._free(e);
    t.i._free(e);
  }
  function Xo(t, e, n) {
    ((t.i.simpleListeners = t.i.simpleListeners || {}),
      (t.i.simpleListeners[e] = n));
  }
  function Ho(t, e, n) {
    let r = [];
    ((t.i.simpleListeners = t.i.simpleListeners || {}),
      (t.i.simpleListeners[e] = (t, e, i) => {
        e ? (n(r, i), (r = [])) : r.push(t);
      }));
  }
  ((Uo.forVisionTasks = function (t) {
    return Oo("vision", t);
  }),
    (Uo.forTextTasks = function (t) {
      return Oo("text", t);
    }),
    (Uo.forGenAiExperimentalTasks = function (t) {
      return Oo("genai_experimental", t);
    }),
    (Uo.forGenAiTasks = function (t) {
      return Oo("genai", t);
    }),
    (Uo.forAudioTasks = function (t) {
      return Oo("audio", t);
    }),
    (Uo.isSimdSupported = function () {
      return Co();
    }));
  async function Wo(t, e, n, r) {
    return (
      (t = await (async (t, e, n, r, i) => {
        if ((e && (await No(e)), !self.ModuleFactory))
          throw Error("ModuleFactory not set.");
        if (n && (await No(n), !self.ModuleFactory))
          throw Error("ModuleFactory not set.");
        return (
          self.Module &&
            i &&
            (((e = self.Module).locateFile = i.locateFile),
            i.mainScriptUrlOrBlob &&
              (e.mainScriptUrlOrBlob = i.mainScriptUrlOrBlob)),
          (i = await self.ModuleFactory(self.Module || i)),
          (self.ModuleFactory = self.Module = void 0),
          new t(i, r)
        );
      })(t, n.wasmLoaderPath, n.assetLoaderPath, e, {
        locateFile: (t) =>
          t.endsWith(".wasm")
            ? n.wasmBinaryPath.toString()
            : n.assetBinaryPath && t.endsWith(".data")
              ? n.assetBinaryPath.toString()
              : t,
      })),
      await t.o(r),
      t
    );
  }
  function zo(t, e) {
    const n = hn(t.baseOptions, Fs, 1) || new Fs();
    ("string" == typeof e
      ? (He(n, 2, de(e)), He(n, 1))
      : e instanceof Uint8Array && (He(n, 1, dt(e, false)), He(n, 2)),
      dn(t.baseOptions, 0, 1, n));
  }
  function Ko(t) {
    try {
      const e = t.G.length;
      if (1 === e) throw Error(t.G[0].message);
      if (e > 1)
        throw Error(
          "Encountered multiple errors: " + t.G.map((t) => t.message).join(", ")
        );
    } finally {
      t.G = [];
    }
  }
  function Yo(t, e) {
    t.B = Math.max(t.B, e);
  }
  function $o(t, e) {
    ((t.A = new zi()),
      Xi(t.A, "PassThroughCalculator"),
      Hi(t.A, "free_memory"),
      Wi(t.A, "free_memory_unused_out"),
      Ji(e, "free_memory"),
      qi(e, t.A));
  }
  function qo(t, e) {
    (Hi(t.A, e), Wi(t.A, e + "_unused_out"));
  }
  function Jo(t) {
    t.g.addBoolToStream(true, "free_memory", t.B);
  }
  var Zo = class {
    constructor(t) {
      ((this.g = t),
        (this.G = []),
        (this.B = 0),
        this.g.setAutoRenderToScreen(false));
    }
    l(t, e = true) {
      if (e) {
        const e = t.baseOptions || {};
        if (t.baseOptions?.modelAssetBuffer && t.baseOptions?.modelAssetPath)
          throw Error(
            "Cannot set both baseOptions.modelAssetPath and baseOptions.modelAssetBuffer"
          );
        if (
          !(
            hn(this.baseOptions, Fs, 1)?.g() ||
            hn(this.baseOptions, Fs, 1)?.h() ||
            t.baseOptions?.modelAssetBuffer ||
            t.baseOptions?.modelAssetPath
          )
        )
          throw Error(
            "Either baseOptions.modelAssetPath or baseOptions.modelAssetBuffer must be set"
          );
        if (
          ((function (t, e) {
            let n = hn(t.baseOptions, Ls, 3);
            if (!n) {
              var r = (n = new Ls()),
                i = new Di();
              fn(r, 4, Rs, i);
            }
            ("delegate" in e &&
              ("GPU" === e.delegate
                ? ((e = n), (r = new Ci()), fn(e, 2, Rs, r))
                : ((e = n), (r = new Di()), fn(e, 4, Rs, r))),
              dn(t.baseOptions, 0, 3, n));
          })(this, e),
          e.modelAssetPath)
        )
          return fetch(e.modelAssetPath.toString())
            .then((t) => {
              if (t.ok) return t.arrayBuffer();
              throw Error(
                `Failed to fetch model: ${e.modelAssetPath} (${t.status})`
              );
            })
            .then((t) => {
              try {
                this.g.i.FS_unlink("/model.dat");
              } catch {}
              (this.g.i.FS_createDataFile(
                "/",
                "model.dat",
                new Uint8Array(t),
                true,
                false,
                false
              ),
                zo(this, "/model.dat"),
                this.m(),
                this.J());
            });
        if (e.modelAssetBuffer instanceof Uint8Array)
          zo(this, e.modelAssetBuffer);
        else if (e.modelAssetBuffer)
          return (async function (t) {
            const e = [];
            for (var n = 0; ; ) {
              const { done: r, value: i } = await t.read();
              if (r) break;
              (e.push(i), (n += i.length));
            }
            if (0 === e.length) return new Uint8Array(0);
            if (1 === e.length) return e[0];
            ((t = new Uint8Array(n)), (n = 0));
            for (const r of e) (t.set(r, n), (n += r.length));
            return t;
          })(e.modelAssetBuffer).then((t) => {
            (zo(this, t), this.m(), this.J());
          });
      }
      return (this.m(), this.J(), Promise.resolve());
    }
    J() {}
    ca() {
      let t;
      if (
        (this.g.ca((e) => {
          t = es(e);
        }),
        !t)
      )
        throw Error("Failed to retrieve CalculatorGraphConfig");
      return t;
    }
    setGraph(t, e) {
      (this.g.attachErrorListener((t, e) => {
        this.G.push(Error(e));
      }),
        this.g.Ha(),
        this.g.setGraph(t, e),
        (this.A = void 0),
        Ko(this));
    }
    finishProcessing() {
      (this.g.finishProcessing(), Ko(this));
    }
    close() {
      ((this.A = void 0), this.g.closeGraph());
    }
  };
  function Qo(t, e) {
    if (!t) throw Error(`Unable to obtain required WebGL resource: ${e}`);
    return t;
  }
  Zo.prototype.close = Zo.prototype.close;
  class ta {
    constructor(t, e, n, r) {
      ((this.g = t), (this.h = e), (this.m = n), (this.l = r));
    }
    bind() {
      this.g.bindVertexArray(this.h);
    }
    close() {
      (this.g.deleteVertexArray(this.h),
        this.g.deleteBuffer(this.m),
        this.g.deleteBuffer(this.l));
    }
  }
  function ea(t, e, n) {
    const r = t.g;
    if (
      ((n = Qo(r.createShader(n), "Failed to create WebGL shader")),
      r.shaderSource(n, e),
      r.compileShader(n),
      !r.getShaderParameter(n, r.COMPILE_STATUS))
    )
      throw Error(`Could not compile WebGL shader: ${r.getShaderInfoLog(n)}`);
    return (r.attachShader(t.h, n), n);
  }
  function na(t, e) {
    const n = t.g,
      r = Qo(n.createVertexArray(), "Failed to create vertex array");
    n.bindVertexArray(r);
    const i = Qo(n.createBuffer(), "Failed to create buffer");
    (n.bindBuffer(n.ARRAY_BUFFER, i),
      n.enableVertexAttribArray(t.P),
      n.vertexAttribPointer(t.P, 2, n.FLOAT, false, 0, 0),
      n.bufferData(
        n.ARRAY_BUFFER,
        new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
        n.STATIC_DRAW
      ));
    const s = Qo(n.createBuffer(), "Failed to create buffer");
    return (
      n.bindBuffer(n.ARRAY_BUFFER, s),
      n.enableVertexAttribArray(t.J),
      n.vertexAttribPointer(t.J, 2, n.FLOAT, false, 0, 0),
      n.bufferData(
        n.ARRAY_BUFFER,
        new Float32Array(
          e ? [0, 1, 0, 0, 1, 0, 1, 1] : [0, 0, 0, 1, 1, 1, 1, 0]
        ),
        n.STATIC_DRAW
      ),
      n.bindBuffer(n.ARRAY_BUFFER, null),
      n.bindVertexArray(null),
      new ta(n, r, i, s)
    );
  }
  function ra(t, e) {
    if (t.g) {
      if (e !== t.g) throw Error("Cannot change GL context once initialized");
    } else t.g = e;
  }
  function ia(t, e, n, r) {
    return (
      ra(t, e),
      t.h || (t.m(), t.C()),
      n
        ? (t.s || (t.s = na(t, true)), (n = t.s))
        : (t.v || (t.v = na(t, false)), (n = t.v)),
      e.useProgram(t.h),
      n.bind(),
      t.l(),
      (t = r()),
      n.g.bindVertexArray(null),
      t
    );
  }
  function sa(t, e, n) {
    return (
      ra(t, e),
      (t = Qo(e.createTexture(), "Failed to create texture")),
      e.bindTexture(e.TEXTURE_2D, t),
      e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE),
      e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE),
      e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, n ?? e.LINEAR),
      e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, n ?? e.LINEAR),
      e.bindTexture(e.TEXTURE_2D, null),
      t
    );
  }
  function oa(t, e, n) {
    (ra(t, e),
      t.A || (t.A = Qo(e.createFramebuffer(), "Failed to create framebuffe.")),
      e.bindFramebuffer(e.FRAMEBUFFER, t.A),
      e.framebufferTexture2D(
        e.FRAMEBUFFER,
        e.COLOR_ATTACHMENT0,
        e.TEXTURE_2D,
        n,
        0
      ));
  }
  function aa(t) {
    t.g?.bindFramebuffer(t.g.FRAMEBUFFER, null);
  }
  var ca = class {
    G() {
      return "\n  precision mediump float;\n  varying vec2 vTex;\n  uniform sampler2D inputTexture;\n  void main() {\n    gl_FragColor = texture2D(inputTexture, vTex);\n  }\n ";
    }
    m() {
      const t = this.g;
      if (
        ((this.h = Qo(t.createProgram(), "Failed to create WebGL program")),
        (this.Z = ea(
          this,
          "\n  attribute vec2 aVertex;\n  attribute vec2 aTex;\n  varying vec2 vTex;\n  void main(void) {\n    gl_Position = vec4(aVertex, 0.0, 1.0);\n    vTex = aTex;\n  }",
          t.VERTEX_SHADER
        )),
        (this.Y = ea(this, this.G(), t.FRAGMENT_SHADER)),
        t.linkProgram(this.h),
        !t.getProgramParameter(this.h, t.LINK_STATUS))
      )
        throw Error(
          `Error during program linking: ${t.getProgramInfoLog(this.h)}`
        );
      ((this.P = t.getAttribLocation(this.h, "aVertex")),
        (this.J = t.getAttribLocation(this.h, "aTex")));
    }
    C() {}
    l() {}
    close() {
      if (this.h) {
        const t = this.g;
        (t.deleteProgram(this.h),
          t.deleteShader(this.Z),
          t.deleteShader(this.Y));
      }
      (this.A && this.g.deleteFramebuffer(this.A),
        this.v && this.v.close(),
        this.s && this.s.close());
    }
  };
  function la(t, e) {
    switch (e) {
      case 0:
        return t.g.find((t) => t instanceof Uint8Array);
      case 1:
        return t.g.find((t) => t instanceof Float32Array);
      case 2:
        return t.g.find(
          (t) => "undefined" != typeof WebGLTexture && t instanceof WebGLTexture
        );
      default:
        throw Error(`Type is not supported: ${e}`);
    }
  }
  function da(t) {
    var e = la(t, 1);
    if (!e) {
      if ((e = la(t, 0))) e = new Float32Array(e).map((t) => t / 255);
      else {
        e = new Float32Array(t.width * t.height);
        const r = pa(t);
        var n = ma(t);
        if (
          (oa(n, r, fa(t)),
          "iPad Simulator;iPhone Simulator;iPod Simulator;iPad;iPhone;iPod"
            .split(";")
            .includes(navigator.platform) ||
            (navigator.userAgent.includes("Mac") &&
              "document" in self &&
              "ontouchend" in self.document))
        ) {
          ((n = new Float32Array(t.width * t.height * 4)),
            r.readPixels(0, 0, t.width, t.height, r.RGBA, r.FLOAT, n));
          for (let t = 0, r = 0; t < e.length; ++t, r += 4) e[t] = n[r];
        } else r.readPixels(0, 0, t.width, t.height, r.RED, r.FLOAT, e);
      }
      t.g.push(e);
    }
    return e;
  }
  function fa(t) {
    let e = la(t, 2);
    if (!e) {
      const n = pa(t);
      e = ya(t);
      const r = da(t),
        i = ga(t);
      (n.texImage2D(
        n.TEXTURE_2D,
        0,
        i,
        t.width,
        t.height,
        0,
        n.RED,
        n.FLOAT,
        r
      ),
        _a(t));
    }
    return e;
  }
  function pa(t) {
    if (!t.canvas)
      throw Error(
        "Conversion to different image formats require that a canvas is passed when initializing the image."
      );
    return (
      t.h ||
        (t.h = Qo(
          t.canvas.getContext("webgl2"),
          "You cannot use a canvas that is already bound to a different type of rendering context."
        )),
      t.h
    );
  }
  function ga(t) {
    if (((t = pa(t)), !va))
      if (
        t.getExtension("EXT_color_buffer_float") &&
        t.getExtension("OES_texture_float_linear") &&
        t.getExtension("EXT_float_blend")
      )
        va = t.R32F;
      else {
        if (!t.getExtension("EXT_color_buffer_half_float"))
          throw Error(
            "GPU does not fully support 4-channel float32 or float16 formats"
          );
        va = t.R16F;
      }
    return va;
  }
  function ma(t) {
    return (t.l || (t.l = new ca()), t.l);
  }
  function ya(t) {
    const e = pa(t);
    (e.viewport(0, 0, t.width, t.height), e.activeTexture(e.TEXTURE0));
    let n = la(t, 2);
    return (
      n ||
        ((n = sa(ma(t), e, t.m ? e.LINEAR : e.NEAREST)),
        t.g.push(n),
        (t.j = true)),
      e.bindTexture(e.TEXTURE_2D, n),
      n
    );
  }
  function _a(t) {
    t.h.bindTexture(t.h.TEXTURE_2D, null);
  }
  var va,
    Ea = class {
      constructor(t, e, n, r, i, s, o) {
        ((this.g = t),
          (this.m = e),
          (this.j = n),
          (this.canvas = r),
          (this.l = i),
          (this.width = s),
          (this.height = o),
          this.j &&
            0 === --wa &&
            console.error(
              "You seem to be creating MPMask instances without invoking .close(). This leaks resources."
            ));
      }
      Da() {
        return !!la(this, 0);
      }
      ja() {
        return !!la(this, 1);
      }
      R() {
        return !!la(this, 2);
      }
      ia() {
        return (
          (e = la((t = this), 0)) ||
            ((e = da(t)),
            (e = new Uint8Array(e.map((t) => 255 * t))),
            t.g.push(e)),
          e
        );
        var t, e;
      }
      ha() {
        return da(this);
      }
      N() {
        return fa(this);
      }
      clone() {
        const t = [];
        for (const e of this.g) {
          let n;
          if (e instanceof Uint8Array) n = new Uint8Array(e);
          else if (e instanceof Float32Array) n = new Float32Array(e);
          else {
            if (!(e instanceof WebGLTexture))
              throw Error(`Type is not supported: ${e}`);
            {
              const t = pa(this),
                e = ma(this);
              (t.activeTexture(t.TEXTURE1),
                (n = sa(e, t, this.m ? t.LINEAR : t.NEAREST)),
                t.bindTexture(t.TEXTURE_2D, n));
              const r = ga(this);
              (t.texImage2D(
                t.TEXTURE_2D,
                0,
                r,
                this.width,
                this.height,
                0,
                t.RED,
                t.FLOAT,
                null
              ),
                t.bindTexture(t.TEXTURE_2D, null),
                oa(e, t, n),
                ia(e, t, false, () => {
                  (ya(this),
                    t.clearColor(0, 0, 0, 0),
                    t.clear(t.COLOR_BUFFER_BIT),
                    t.drawArrays(t.TRIANGLE_FAN, 0, 4),
                    _a(this));
                }),
                aa(e),
                _a(this));
            }
          }
          t.push(n);
        }
        return new Ea(
          t,
          this.m,
          this.R(),
          this.canvas,
          this.l,
          this.width,
          this.height
        );
      }
      close() {
        (this.j && pa(this).deleteTexture(la(this, 2)), (wa = -1));
      }
    };
  ((Ea.prototype.close = Ea.prototype.close),
    (Ea.prototype.clone = Ea.prototype.clone),
    (Ea.prototype.getAsWebGLTexture = Ea.prototype.N),
    (Ea.prototype.getAsFloat32Array = Ea.prototype.ha),
    (Ea.prototype.getAsUint8Array = Ea.prototype.ia),
    (Ea.prototype.hasWebGLTexture = Ea.prototype.R),
    (Ea.prototype.hasFloat32Array = Ea.prototype.ja),
    (Ea.prototype.hasUint8Array = Ea.prototype.Da));
  var wa = 250;
  function Ma(t, e) {
    switch (e) {
      case 0:
        return t.g.find((t) => t instanceof ImageData);
      case 1:
        return t.g.find(
          (t) => "undefined" != typeof ImageBitmap && t instanceof ImageBitmap
        );
      case 2:
        return t.g.find(
          (t) => "undefined" != typeof WebGLTexture && t instanceof WebGLTexture
        );
      default:
        throw Error(`Type is not supported: ${e}`);
    }
  }
  function Pa(t) {
    var e = Ma(t, 0);
    if (!e) {
      e = Oa(t);
      const n = Ua(t),
        r = new Uint8Array(t.width * t.height * 4);
      (oa(n, e, Ca(t)),
        e.readPixels(0, 0, t.width, t.height, e.RGBA, e.UNSIGNED_BYTE, r),
        aa(n),
        (e = new ImageData(new Uint8ClampedArray(r.buffer), t.width, t.height)),
        t.g.push(e));
    }
    return e;
  }
  function Ca(t) {
    let e = Ma(t, 2);
    if (!e) {
      const n = Oa(t);
      e = Da(t);
      const r = Ma(t, 1) || Pa(t);
      (n.texImage2D(n.TEXTURE_2D, 0, n.RGBA, n.RGBA, n.UNSIGNED_BYTE, r),
        Na(t));
    }
    return e;
  }
  function Oa(t) {
    if (!t.canvas)
      throw Error(
        "Conversion to different image formats require that a canvas is passed when initializing the image."
      );
    return (
      t.h ||
        (t.h = Qo(
          t.canvas.getContext("webgl2"),
          "You cannot use a canvas that is already bound to a different type of rendering context."
        )),
      t.h
    );
  }
  function Ua(t) {
    return (t.l || (t.l = new ca()), t.l);
  }
  function Da(t) {
    const e = Oa(t);
    (e.viewport(0, 0, t.width, t.height), e.activeTexture(e.TEXTURE0));
    let n = Ma(t, 2);
    return (
      n || ((n = sa(Ua(t), e)), t.g.push(n), (t.m = true)),
      e.bindTexture(e.TEXTURE_2D, n),
      n
    );
  }
  function Na(t) {
    t.h.bindTexture(t.h.TEXTURE_2D, null);
  }
  function Ba(t) {
    const e = Oa(t);
    return ia(Ua(t), e, true, () =>
      (function (t, e) {
        const n = t.canvas;
        if (n.width === t.width && n.height === t.height) return e();
        const r = n.width,
          i = n.height;
        return (
          (n.width = t.width),
          (n.height = t.height),
          (t = e()),
          (n.width = r),
          (n.height = i),
          t
        );
      })(t, () => {
        if (
          (e.bindFramebuffer(e.FRAMEBUFFER, null),
          e.clearColor(0, 0, 0, 0),
          e.clear(e.COLOR_BUFFER_BIT),
          e.drawArrays(e.TRIANGLE_FAN, 0, 4),
          !(t.canvas instanceof OffscreenCanvas))
        )
          throw Error(
            "Conversion to ImageBitmap requires that the MediaPipe Tasks is initialized with an OffscreenCanvas"
          );
        return t.canvas.transferToImageBitmap();
      })
    );
  }
  var Ga = class {
    constructor(t, e, n, r, i, s, o) {
      ((this.g = t),
        (this.j = e),
        (this.m = n),
        (this.canvas = r),
        (this.l = i),
        (this.width = s),
        (this.height = o),
        (this.j || this.m) &&
          0 === --ja &&
          console.error(
            "You seem to be creating MPImage instances without invoking .close(). This leaks resources."
          ));
    }
    Ca() {
      return !!Ma(this, 0);
    }
    ka() {
      return !!Ma(this, 1);
    }
    R() {
      return !!Ma(this, 2);
    }
    Aa() {
      return Pa(this);
    }
    za() {
      var t = Ma(this, 1);
      return (
        t ||
          (Ca(this),
          Da(this),
          (t = Ba(this)),
          Na(this),
          this.g.push(t),
          (this.j = true)),
        t
      );
    }
    N() {
      return Ca(this);
    }
    clone() {
      const t = [];
      for (const e of this.g) {
        let n;
        if (e instanceof ImageData)
          n = new ImageData(e.data, this.width, this.height);
        else if (e instanceof WebGLTexture) {
          const t = Oa(this),
            e = Ua(this);
          (t.activeTexture(t.TEXTURE1),
            (n = sa(e, t)),
            t.bindTexture(t.TEXTURE_2D, n),
            t.texImage2D(
              t.TEXTURE_2D,
              0,
              t.RGBA,
              this.width,
              this.height,
              0,
              t.RGBA,
              t.UNSIGNED_BYTE,
              null
            ),
            t.bindTexture(t.TEXTURE_2D, null),
            oa(e, t, n),
            ia(e, t, false, () => {
              (Da(this),
                t.clearColor(0, 0, 0, 0),
                t.clear(t.COLOR_BUFFER_BIT),
                t.drawArrays(t.TRIANGLE_FAN, 0, 4),
                Na(this));
            }),
            aa(e),
            Na(this));
        } else {
          if (!(e instanceof ImageBitmap))
            throw Error(`Type is not supported: ${e}`);
          (Ca(this), Da(this), (n = Ba(this)), Na(this));
        }
        t.push(n);
      }
      return new Ga(
        t,
        this.ka(),
        this.R(),
        this.canvas,
        this.l,
        this.width,
        this.height
      );
    }
    close() {
      (this.j && Ma(this, 1).close(),
        this.m && Oa(this).deleteTexture(Ma(this, 2)),
        (ja = -1));
    }
  };
  ((Ga.prototype.close = Ga.prototype.close),
    (Ga.prototype.clone = Ga.prototype.clone),
    (Ga.prototype.getAsWebGLTexture = Ga.prototype.N),
    (Ga.prototype.getAsImageBitmap = Ga.prototype.za),
    (Ga.prototype.getAsImageData = Ga.prototype.Aa),
    (Ga.prototype.hasWebGLTexture = Ga.prototype.R),
    (Ga.prototype.hasImageBitmap = Ga.prototype.ka),
    (Ga.prototype.hasImageData = Ga.prototype.Ca));
  var ja = 250;
  function Va(...t) {
    return t.map(([t, e]) => ({ start: t, end: e }));
  }
  const Xa = (function (t) {
    return class extends t {
      Ha() {
        this.i._registerModelResourcesGraphService();
      }
    };
  })(
    ((Ha = class {
      constructor(t, e) {
        ((this.l = true),
          (this.i = t),
          (this.g = null),
          (this.h = 0),
          (this.m = "function" == typeof this.i._addIntToInputStream),
          void 0 !== e
            ? (this.i.canvas = e)
            : Do()
              ? (this.i.canvas = new OffscreenCanvas(1, 1))
              : (console.warn(
                  "OffscreenCanvas not supported and GraphRunner constructor glCanvas parameter is undefined. Creating backup canvas."
                ),
                (this.i.canvas = document.createElement("canvas"))));
      }
      async initializeGraph(t) {
        const e = await (await fetch(t)).arrayBuffer();
        ((t = !(t.endsWith(".pbtxt") || t.endsWith(".textproto"))),
          this.setGraph(new Uint8Array(e), t));
      }
      setGraphFromString(t) {
        this.setGraph(new TextEncoder().encode(t), false);
      }
      setGraph(t, e) {
        const n = t.length,
          r = this.i._malloc(n);
        (this.i.HEAPU8.set(t, r),
          e ? this.i._changeBinaryGraph(n, r) : this.i._changeTextGraph(n, r),
          this.i._free(r));
      }
      configureAudio(t, e, n, r, i) {
        (this.i._configureAudio ||
          console.warn(
            'Attempting to use configureAudio without support for input audio. Is build dep ":gl_graph_runner_audio" missing?'
          ),
          Go(this, r || "input_audio", (r) => {
            Go(this, (i = i || "audio_header"), (i) => {
              this.i._configureAudio(r, i, t, e ?? 0, n);
            });
          }));
      }
      setAutoResizeCanvas(t) {
        this.l = t;
      }
      setAutoRenderToScreen(t) {
        this.i._setAutoRenderToScreen(t);
      }
      setGpuBufferVerticalFlip(t) {
        this.i.gpuOriginForWebTexturesIsBottomLeft = t;
      }
      ca(t) {
        (Xo(this, "__graph_config__", (e) => {
          t(e);
        }),
          Go(this, "__graph_config__", (t) => {
            this.i._getGraphConfig(t, void 0);
          }),
          delete this.i.simpleListeners.__graph_config__);
      }
      attachErrorListener(t) {
        this.i.errorListener = t;
      }
      attachEmptyPacketListener(t, e) {
        ((this.i.emptyPacketListeners = this.i.emptyPacketListeners || {}),
          (this.i.emptyPacketListeners[t] = e));
      }
      addAudioToStream(t, e, n) {
        this.addAudioToStreamWithShape(t, 0, 0, e, n);
      }
      addAudioToStreamWithShape(t, e, n, r, i) {
        const s = 4 * t.length;
        (this.h !== s &&
          (this.g && this.i._free(this.g),
          (this.g = this.i._malloc(s)),
          (this.h = s)),
          this.i.HEAPF32.set(t, this.g / 4),
          Go(this, r, (t) => {
            this.i._addAudioToInputStream(this.g, e, n, t, i);
          }));
      }
      addGpuBufferToStream(t, e, n) {
        Go(this, e, (e) => {
          const [r, i] = jo(this, t, e);
          this.i._addBoundTextureToStream(e, r, i, n);
        });
      }
      addBoolToStream(t, e, n) {
        Go(this, e, (e) => {
          this.i._addBoolToInputStream(t, e, n);
        });
      }
      addDoubleToStream(t, e, n) {
        Go(this, e, (e) => {
          this.i._addDoubleToInputStream(t, e, n);
        });
      }
      addFloatToStream(t, e, n) {
        Go(this, e, (e) => {
          this.i._addFloatToInputStream(t, e, n);
        });
      }
      addIntToStream(t, e, n) {
        Go(this, e, (e) => {
          this.i._addIntToInputStream(t, e, n);
        });
      }
      addUintToStream(t, e, n) {
        Go(this, e, (e) => {
          this.i._addUintToInputStream(t, e, n);
        });
      }
      addStringToStream(t, e, n) {
        Go(this, e, (e) => {
          Go(this, t, (t) => {
            this.i._addStringToInputStream(t, e, n);
          });
        });
      }
      addStringRecordToStream(t, e, n) {
        Go(this, e, (e) => {
          Vo(this, Object.keys(t), (r) => {
            Vo(this, Object.values(t), (i) => {
              this.i._addFlatHashMapToInputStream(
                r,
                i,
                Object.keys(t).length,
                e,
                n
              );
            });
          });
        });
      }
      addProtoToStream(t, e, n, r) {
        Go(this, n, (n) => {
          Go(this, e, (e) => {
            const i = this.i._malloc(t.length);
            (this.i.HEAPU8.set(t, i),
              this.i._addProtoToInputStream(i, t.length, e, n, r),
              this.i._free(i));
          });
        });
      }
      addEmptyPacketToStream(t, e) {
        Go(this, t, (t) => {
          this.i._addEmptyPacketToInputStream(t, e);
        });
      }
      addBoolVectorToStream(t, e, n) {
        Go(this, e, (e) => {
          const r = this.i._allocateBoolVector(t.length);
          if (!r) throw Error("Unable to allocate new bool vector on heap.");
          for (const e of t) this.i._addBoolVectorEntry(r, e);
          this.i._addBoolVectorToInputStream(r, e, n);
        });
      }
      addDoubleVectorToStream(t, e, n) {
        Go(this, e, (e) => {
          const r = this.i._allocateDoubleVector(t.length);
          if (!r) throw Error("Unable to allocate new double vector on heap.");
          for (const e of t) this.i._addDoubleVectorEntry(r, e);
          this.i._addDoubleVectorToInputStream(r, e, n);
        });
      }
      addFloatVectorToStream(t, e, n) {
        Go(this, e, (e) => {
          const r = this.i._allocateFloatVector(t.length);
          if (!r) throw Error("Unable to allocate new float vector on heap.");
          for (const e of t) this.i._addFloatVectorEntry(r, e);
          this.i._addFloatVectorToInputStream(r, e, n);
        });
      }
      addIntVectorToStream(t, e, n) {
        Go(this, e, (e) => {
          const r = this.i._allocateIntVector(t.length);
          if (!r) throw Error("Unable to allocate new int vector on heap.");
          for (const e of t) this.i._addIntVectorEntry(r, e);
          this.i._addIntVectorToInputStream(r, e, n);
        });
      }
      addUintVectorToStream(t, e, n) {
        Go(this, e, (e) => {
          const r = this.i._allocateUintVector(t.length);
          if (!r)
            throw Error("Unable to allocate new unsigned int vector on heap.");
          for (const e of t) this.i._addUintVectorEntry(r, e);
          this.i._addUintVectorToInputStream(r, e, n);
        });
      }
      addStringVectorToStream(t, e, n) {
        Go(this, e, (e) => {
          const r = this.i._allocateStringVector(t.length);
          if (!r) throw Error("Unable to allocate new string vector on heap.");
          for (const e of t)
            Go(this, e, (t) => {
              this.i._addStringVectorEntry(r, t);
            });
          this.i._addStringVectorToInputStream(r, e, n);
        });
      }
      addBoolToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          this.i._addBoolToInputSidePacket(t, e);
        });
      }
      addDoubleToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          this.i._addDoubleToInputSidePacket(t, e);
        });
      }
      addFloatToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          this.i._addFloatToInputSidePacket(t, e);
        });
      }
      addIntToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          this.i._addIntToInputSidePacket(t, e);
        });
      }
      addUintToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          this.i._addUintToInputSidePacket(t, e);
        });
      }
      addStringToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          Go(this, t, (t) => {
            this.i._addStringToInputSidePacket(t, e);
          });
        });
      }
      addProtoToInputSidePacket(t, e, n) {
        Go(this, n, (n) => {
          Go(this, e, (e) => {
            const r = this.i._malloc(t.length);
            (this.i.HEAPU8.set(t, r),
              this.i._addProtoToInputSidePacket(r, t.length, e, n),
              this.i._free(r));
          });
        });
      }
      addBoolVectorToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          const n = this.i._allocateBoolVector(t.length);
          if (!n) throw Error("Unable to allocate new bool vector on heap.");
          for (const e of t) this.i._addBoolVectorEntry(n, e);
          this.i._addBoolVectorToInputSidePacket(n, e);
        });
      }
      addDoubleVectorToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          const n = this.i._allocateDoubleVector(t.length);
          if (!n) throw Error("Unable to allocate new double vector on heap.");
          for (const e of t) this.i._addDoubleVectorEntry(n, e);
          this.i._addDoubleVectorToInputSidePacket(n, e);
        });
      }
      addFloatVectorToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          const n = this.i._allocateFloatVector(t.length);
          if (!n) throw Error("Unable to allocate new float vector on heap.");
          for (const e of t) this.i._addFloatVectorEntry(n, e);
          this.i._addFloatVectorToInputSidePacket(n, e);
        });
      }
      addIntVectorToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          const n = this.i._allocateIntVector(t.length);
          if (!n) throw Error("Unable to allocate new int vector on heap.");
          for (const e of t) this.i._addIntVectorEntry(n, e);
          this.i._addIntVectorToInputSidePacket(n, e);
        });
      }
      addUintVectorToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          const n = this.i._allocateUintVector(t.length);
          if (!n)
            throw Error("Unable to allocate new unsigned int vector on heap.");
          for (const e of t) this.i._addUintVectorEntry(n, e);
          this.i._addUintVectorToInputSidePacket(n, e);
        });
      }
      addStringVectorToInputSidePacket(t, e) {
        Go(this, e, (e) => {
          const n = this.i._allocateStringVector(t.length);
          if (!n) throw Error("Unable to allocate new string vector on heap.");
          for (const e of t)
            Go(this, e, (t) => {
              this.i._addStringVectorEntry(n, t);
            });
          this.i._addStringVectorToInputSidePacket(n, e);
        });
      }
      attachBoolListener(t, e) {
        (Xo(this, t, e),
          Go(this, t, (t) => {
            this.i._attachBoolListener(t);
          }));
      }
      attachBoolVectorListener(t, e) {
        (Ho(this, t, e),
          Go(this, t, (t) => {
            this.i._attachBoolVectorListener(t);
          }));
      }
      attachIntListener(t, e) {
        (Xo(this, t, e),
          Go(this, t, (t) => {
            this.i._attachIntListener(t);
          }));
      }
      attachIntVectorListener(t, e) {
        (Ho(this, t, e),
          Go(this, t, (t) => {
            this.i._attachIntVectorListener(t);
          }));
      }
      attachUintListener(t, e) {
        (Xo(this, t, e),
          Go(this, t, (t) => {
            this.i._attachUintListener(t);
          }));
      }
      attachUintVectorListener(t, e) {
        (Ho(this, t, e),
          Go(this, t, (t) => {
            this.i._attachUintVectorListener(t);
          }));
      }
      attachDoubleListener(t, e) {
        (Xo(this, t, e),
          Go(this, t, (t) => {
            this.i._attachDoubleListener(t);
          }));
      }
      attachDoubleVectorListener(t, e) {
        (Ho(this, t, e),
          Go(this, t, (t) => {
            this.i._attachDoubleVectorListener(t);
          }));
      }
      attachFloatListener(t, e) {
        (Xo(this, t, e),
          Go(this, t, (t) => {
            this.i._attachFloatListener(t);
          }));
      }
      attachFloatVectorListener(t, e) {
        (Ho(this, t, e),
          Go(this, t, (t) => {
            this.i._attachFloatVectorListener(t);
          }));
      }
      attachStringListener(t, e) {
        (Xo(this, t, e),
          Go(this, t, (t) => {
            this.i._attachStringListener(t);
          }));
      }
      attachStringVectorListener(t, e) {
        (Ho(this, t, e),
          Go(this, t, (t) => {
            this.i._attachStringVectorListener(t);
          }));
      }
      attachProtoListener(t, e, n) {
        (Xo(this, t, e),
          Go(this, t, (t) => {
            this.i._attachProtoListener(t, n || false);
          }));
      }
      attachProtoVectorListener(t, e, n) {
        (Ho(this, t, e),
          Go(this, t, (t) => {
            this.i._attachProtoVectorListener(t, n || false);
          }));
      }
      attachAudioListener(t, e, n) {
        (this.i._attachAudioListener ||
          console.warn(
            'Attempting to use attachAudioListener without support for output audio. Is build dep ":gl_graph_runner_audio_out" missing?'
          ),
          Xo(this, t, (t, n) => {
            ((t = new Float32Array(t.buffer, t.byteOffset, t.length / 4)),
              e(t, n));
          }),
          Go(this, t, (t) => {
            this.i._attachAudioListener(t, n || false);
          }));
      }
      finishProcessing() {
        this.i._waitUntilIdle();
      }
      closeGraph() {
        (this.i._closeGraph(),
          (this.i.simpleListeners = void 0),
          (this.i.emptyPacketListeners = void 0));
      }
    }),
    class extends Ha {
      get ea() {
        return this.i;
      }
      oa(t, e, n) {
        Go(this, e, (e) => {
          const [r, i] = jo(this, t, e);
          this.ea._addBoundTextureAsImageToStream(e, r, i, n);
        });
      }
      V(t, e) {
        (Xo(this, t, e),
          Go(this, t, (t) => {
            this.ea._attachImageListener(t);
          }));
      }
      ba(t, e) {
        (Ho(this, t, e),
          Go(this, t, (t) => {
            this.ea._attachImageVectorListener(t);
          }));
      }
    })
  );
  var Ha,
    Wa = class extends Xa {};
  async function za(t, e, n) {
    return (async function (t, e, n, r) {
      return Wo(t, e, n, r);
    })(t, n.canvas ?? (Do() ? void 0 : document.createElement("canvas")), e, n);
  }
  function Ka(t, e, n, r) {
    if (t.U) {
      const s = new ms();
      if (n?.regionOfInterest) {
        if (!t.na) throw Error("This task doesn't support region-of-interest.");
        var i = n.regionOfInterest;
        if (i.left >= i.right || i.top >= i.bottom)
          throw Error("Expected RectF with left < right and top < bottom.");
        if (i.left < 0 || i.top < 0 || i.right > 1 || i.bottom > 1)
          throw Error("Expected RectF values to be in [0,1].");
        (An(s, 1, (i.left + i.right) / 2),
          An(s, 2, (i.top + i.bottom) / 2),
          An(s, 4, i.right - i.left),
          An(s, 3, i.bottom - i.top));
      } else (An(s, 1, 0.5), An(s, 2, 0.5), An(s, 4, 1), An(s, 3, 1));
      if (n?.rotationDegrees) {
        if (n?.rotationDegrees % 90 != 0)
          throw Error("Expected rotation to be a multiple of 90°.");
        if (
          (An(s, 5, (-Math.PI * n.rotationDegrees) / 180),
          n?.rotationDegrees % 180 != 0)
        ) {
          const [t, r] = Bo(e);
          ((n = (En(s, 3) * r) / t),
            (i = (En(s, 4) * t) / r),
            An(s, 4, n),
            An(s, 3, i));
        }
      }
      t.g.addProtoToStream(s.g(), "mediapipe.NormalizedRect", t.U, r);
    }
    (t.g.oa(e, t.Z, r ?? performance.now()), t.finishProcessing());
  }
  function Ya(t, e, n) {
    if (t.baseOptions?.g())
      throw Error(
        "Task is not initialized with image mode. 'runningMode' must be set to 'IMAGE'."
      );
    Ka(t, e, n, t.B + 1);
  }
  function $a(t, e, n, r) {
    if (!t.baseOptions?.g())
      throw Error(
        "Task is not initialized with video mode. 'runningMode' must be set to 'VIDEO'."
      );
    Ka(t, e, n, r);
  }
  function qa(t, e, n, r) {
    var i = e.data;
    const s = e.width,
      o = s * (e = e.height);
    if (
      (i instanceof Uint8Array || i instanceof Float32Array) &&
      i.length !== o
    )
      throw Error("Unsupported channel count: " + i.length / o);
    return (
      (t = new Ea([i], n, false, t.g.i.canvas, t.P, s, e)),
      r ? t.clone() : t
    );
  }
  var Ja = class extends Zo {
    constructor(t, e, n, r) {
      (super(t),
        (this.g = t),
        (this.Z = e),
        (this.U = n),
        (this.na = r),
        (this.P = new ca()));
    }
    l(t, e = true) {
      if (
        ("runningMode" in t &&
          wn(this.baseOptions, 2, !!t.runningMode && "IMAGE" !== t.runningMode),
        void 0 !== t.canvas && this.g.i.canvas !== t.canvas)
      )
        throw Error("You must create a new task to reset the canvas.");
      return super.l(t, e);
    }
    close() {
      (this.P.close(), super.close());
    }
  };
  Ja.prototype.close = Ja.prototype.close;
  var Za = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect_in", false),
        (this.j = { detections: [] }),
        dn((t = this.h = new Cs()), 0, 1, (e = new Is())),
        An(this.h, 2, 0.5),
        An(this.h, 3, 0.3));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      return (
        "minDetectionConfidence" in t &&
          An(this.h, 2, t.minDetectionConfidence ?? 0.5),
        "minSuppressionThreshold" in t &&
          An(this.h, 3, t.minSuppressionThreshold ?? 0.3),
        this.l(t)
      );
    }
    D(t, e) {
      return ((this.j = { detections: [] }), Ya(this, t, e), this.j);
    }
    F(t, e, n) {
      return ((this.j = { detections: [] }), $a(this, t, n, e), this.j);
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"), Ji(t, "norm_rect_in"), Zi(t, "detections"));
      const e = new Gi();
      Yn(e, Us, this.h);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.face_detector.FaceDetectorGraph"),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "NORM_RECT:norm_rect_in"),
        Wi(n, "DETECTIONS:detections"),
        n.o(e),
        qi(t, n),
        this.g.attachProtoVectorListener("detections", (t, e) => {
          for (const e of t) ((t = hs(e)), this.j.detections.push(xo(t)));
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("detections", (t) => {
          Yo(this, t);
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((Za.prototype.detectForVideo = Za.prototype.F),
    (Za.prototype.detect = Za.prototype.D),
    (Za.prototype.setOptions = Za.prototype.o),
    (Za.createFromModelPath = async function (t, e) {
      return za(Za, t, { baseOptions: { modelAssetPath: e } });
    }),
    (Za.createFromModelBuffer = function (t, e) {
      return za(Za, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (Za.createFromOptions = function (t, e) {
      return za(Za, t, e);
    }));
  var Qa = Va(
      [61, 146],
      [146, 91],
      [91, 181],
      [181, 84],
      [84, 17],
      [17, 314],
      [314, 405],
      [405, 321],
      [321, 375],
      [375, 291],
      [61, 185],
      [185, 40],
      [40, 39],
      [39, 37],
      [37, 0],
      [0, 267],
      [267, 269],
      [269, 270],
      [270, 409],
      [409, 291],
      [78, 95],
      [95, 88],
      [88, 178],
      [178, 87],
      [87, 14],
      [14, 317],
      [317, 402],
      [402, 318],
      [318, 324],
      [324, 308],
      [78, 191],
      [191, 80],
      [80, 81],
      [81, 82],
      [82, 13],
      [13, 312],
      [312, 311],
      [311, 310],
      [310, 415],
      [415, 308]
    ),
    tc = Va(
      [263, 249],
      [249, 390],
      [390, 373],
      [373, 374],
      [374, 380],
      [380, 381],
      [381, 382],
      [382, 362],
      [263, 466],
      [466, 388],
      [388, 387],
      [387, 386],
      [386, 385],
      [385, 384],
      [384, 398],
      [398, 362]
    ),
    ec = Va(
      [276, 283],
      [283, 282],
      [282, 295],
      [295, 285],
      [300, 293],
      [293, 334],
      [334, 296],
      [296, 336]
    ),
    nc = Va([474, 475], [475, 476], [476, 477], [477, 474]),
    rc = Va(
      [33, 7],
      [7, 163],
      [163, 144],
      [144, 145],
      [145, 153],
      [153, 154],
      [154, 155],
      [155, 133],
      [33, 246],
      [246, 161],
      [161, 160],
      [160, 159],
      [159, 158],
      [158, 157],
      [157, 173],
      [173, 133]
    ),
    ic = Va(
      [46, 53],
      [53, 52],
      [52, 65],
      [65, 55],
      [70, 63],
      [63, 105],
      [105, 66],
      [66, 107]
    ),
    sc = Va([469, 470], [470, 471], [471, 472], [472, 469]),
    oc = Va(
      [10, 338],
      [338, 297],
      [297, 332],
      [332, 284],
      [284, 251],
      [251, 389],
      [389, 356],
      [356, 454],
      [454, 323],
      [323, 361],
      [361, 288],
      [288, 397],
      [397, 365],
      [365, 379],
      [379, 378],
      [378, 400],
      [400, 377],
      [377, 152],
      [152, 148],
      [148, 176],
      [176, 149],
      [149, 150],
      [150, 136],
      [136, 172],
      [172, 58],
      [58, 132],
      [132, 93],
      [93, 234],
      [234, 127],
      [127, 162],
      [162, 21],
      [21, 54],
      [54, 103],
      [103, 67],
      [67, 109],
      [109, 10]
    ),
    ac = [...Qa, ...tc, ...ec, ...rc, ...ic, ...oc],
    cc = Va(
      [127, 34],
      [34, 139],
      [139, 127],
      [11, 0],
      [0, 37],
      [37, 11],
      [232, 231],
      [231, 120],
      [120, 232],
      [72, 37],
      [37, 39],
      [39, 72],
      [128, 121],
      [121, 47],
      [47, 128],
      [232, 121],
      [121, 128],
      [128, 232],
      [104, 69],
      [69, 67],
      [67, 104],
      [175, 171],
      [171, 148],
      [148, 175],
      [118, 50],
      [50, 101],
      [101, 118],
      [73, 39],
      [39, 40],
      [40, 73],
      [9, 151],
      [151, 108],
      [108, 9],
      [48, 115],
      [115, 131],
      [131, 48],
      [194, 204],
      [204, 211],
      [211, 194],
      [74, 40],
      [40, 185],
      [185, 74],
      [80, 42],
      [42, 183],
      [183, 80],
      [40, 92],
      [92, 186],
      [186, 40],
      [230, 229],
      [229, 118],
      [118, 230],
      [202, 212],
      [212, 214],
      [214, 202],
      [83, 18],
      [18, 17],
      [17, 83],
      [76, 61],
      [61, 146],
      [146, 76],
      [160, 29],
      [29, 30],
      [30, 160],
      [56, 157],
      [157, 173],
      [173, 56],
      [106, 204],
      [204, 194],
      [194, 106],
      [135, 214],
      [214, 192],
      [192, 135],
      [203, 165],
      [165, 98],
      [98, 203],
      [21, 71],
      [71, 68],
      [68, 21],
      [51, 45],
      [45, 4],
      [4, 51],
      [144, 24],
      [24, 23],
      [23, 144],
      [77, 146],
      [146, 91],
      [91, 77],
      [205, 50],
      [50, 187],
      [187, 205],
      [201, 200],
      [200, 18],
      [18, 201],
      [91, 106],
      [106, 182],
      [182, 91],
      [90, 91],
      [91, 181],
      [181, 90],
      [85, 84],
      [84, 17],
      [17, 85],
      [206, 203],
      [203, 36],
      [36, 206],
      [148, 171],
      [171, 140],
      [140, 148],
      [92, 40],
      [40, 39],
      [39, 92],
      [193, 189],
      [189, 244],
      [244, 193],
      [159, 158],
      [158, 28],
      [28, 159],
      [247, 246],
      [246, 161],
      [161, 247],
      [236, 3],
      [3, 196],
      [196, 236],
      [54, 68],
      [68, 104],
      [104, 54],
      [193, 168],
      [168, 8],
      [8, 193],
      [117, 228],
      [228, 31],
      [31, 117],
      [189, 193],
      [193, 55],
      [55, 189],
      [98, 97],
      [97, 99],
      [99, 98],
      [126, 47],
      [47, 100],
      [100, 126],
      [166, 79],
      [79, 218],
      [218, 166],
      [155, 154],
      [154, 26],
      [26, 155],
      [209, 49],
      [49, 131],
      [131, 209],
      [135, 136],
      [136, 150],
      [150, 135],
      [47, 126],
      [126, 217],
      [217, 47],
      [223, 52],
      [52, 53],
      [53, 223],
      [45, 51],
      [51, 134],
      [134, 45],
      [211, 170],
      [170, 140],
      [140, 211],
      [67, 69],
      [69, 108],
      [108, 67],
      [43, 106],
      [106, 91],
      [91, 43],
      [230, 119],
      [119, 120],
      [120, 230],
      [226, 130],
      [130, 247],
      [247, 226],
      [63, 53],
      [53, 52],
      [52, 63],
      [238, 20],
      [20, 242],
      [242, 238],
      [46, 70],
      [70, 156],
      [156, 46],
      [78, 62],
      [62, 96],
      [96, 78],
      [46, 53],
      [53, 63],
      [63, 46],
      [143, 34],
      [34, 227],
      [227, 143],
      [123, 117],
      [117, 111],
      [111, 123],
      [44, 125],
      [125, 19],
      [19, 44],
      [236, 134],
      [134, 51],
      [51, 236],
      [216, 206],
      [206, 205],
      [205, 216],
      [154, 153],
      [153, 22],
      [22, 154],
      [39, 37],
      [37, 167],
      [167, 39],
      [200, 201],
      [201, 208],
      [208, 200],
      [36, 142],
      [142, 100],
      [100, 36],
      [57, 212],
      [212, 202],
      [202, 57],
      [20, 60],
      [60, 99],
      [99, 20],
      [28, 158],
      [158, 157],
      [157, 28],
      [35, 226],
      [226, 113],
      [113, 35],
      [160, 159],
      [159, 27],
      [27, 160],
      [204, 202],
      [202, 210],
      [210, 204],
      [113, 225],
      [225, 46],
      [46, 113],
      [43, 202],
      [202, 204],
      [204, 43],
      [62, 76],
      [76, 77],
      [77, 62],
      [137, 123],
      [123, 116],
      [116, 137],
      [41, 38],
      [38, 72],
      [72, 41],
      [203, 129],
      [129, 142],
      [142, 203],
      [64, 98],
      [98, 240],
      [240, 64],
      [49, 102],
      [102, 64],
      [64, 49],
      [41, 73],
      [73, 74],
      [74, 41],
      [212, 216],
      [216, 207],
      [207, 212],
      [42, 74],
      [74, 184],
      [184, 42],
      [169, 170],
      [170, 211],
      [211, 169],
      [170, 149],
      [149, 176],
      [176, 170],
      [105, 66],
      [66, 69],
      [69, 105],
      [122, 6],
      [6, 168],
      [168, 122],
      [123, 147],
      [147, 187],
      [187, 123],
      [96, 77],
      [77, 90],
      [90, 96],
      [65, 55],
      [55, 107],
      [107, 65],
      [89, 90],
      [90, 180],
      [180, 89],
      [101, 100],
      [100, 120],
      [120, 101],
      [63, 105],
      [105, 104],
      [104, 63],
      [93, 137],
      [137, 227],
      [227, 93],
      [15, 86],
      [86, 85],
      [85, 15],
      [129, 102],
      [102, 49],
      [49, 129],
      [14, 87],
      [87, 86],
      [86, 14],
      [55, 8],
      [8, 9],
      [9, 55],
      [100, 47],
      [47, 121],
      [121, 100],
      [145, 23],
      [23, 22],
      [22, 145],
      [88, 89],
      [89, 179],
      [179, 88],
      [6, 122],
      [122, 196],
      [196, 6],
      [88, 95],
      [95, 96],
      [96, 88],
      [138, 172],
      [172, 136],
      [136, 138],
      [215, 58],
      [58, 172],
      [172, 215],
      [115, 48],
      [48, 219],
      [219, 115],
      [42, 80],
      [80, 81],
      [81, 42],
      [195, 3],
      [3, 51],
      [51, 195],
      [43, 146],
      [146, 61],
      [61, 43],
      [171, 175],
      [175, 199],
      [199, 171],
      [81, 82],
      [82, 38],
      [38, 81],
      [53, 46],
      [46, 225],
      [225, 53],
      [144, 163],
      [163, 110],
      [110, 144],
      [52, 65],
      [65, 66],
      [66, 52],
      [229, 228],
      [228, 117],
      [117, 229],
      [34, 127],
      [127, 234],
      [234, 34],
      [107, 108],
      [108, 69],
      [69, 107],
      [109, 108],
      [108, 151],
      [151, 109],
      [48, 64],
      [64, 235],
      [235, 48],
      [62, 78],
      [78, 191],
      [191, 62],
      [129, 209],
      [209, 126],
      [126, 129],
      [111, 35],
      [35, 143],
      [143, 111],
      [117, 123],
      [123, 50],
      [50, 117],
      [222, 65],
      [65, 52],
      [52, 222],
      [19, 125],
      [125, 141],
      [141, 19],
      [221, 55],
      [55, 65],
      [65, 221],
      [3, 195],
      [195, 197],
      [197, 3],
      [25, 7],
      [7, 33],
      [33, 25],
      [220, 237],
      [237, 44],
      [44, 220],
      [70, 71],
      [71, 139],
      [139, 70],
      [122, 193],
      [193, 245],
      [245, 122],
      [247, 130],
      [130, 33],
      [33, 247],
      [71, 21],
      [21, 162],
      [162, 71],
      [170, 169],
      [169, 150],
      [150, 170],
      [188, 174],
      [174, 196],
      [196, 188],
      [216, 186],
      [186, 92],
      [92, 216],
      [2, 97],
      [97, 167],
      [167, 2],
      [141, 125],
      [125, 241],
      [241, 141],
      [164, 167],
      [167, 37],
      [37, 164],
      [72, 38],
      [38, 12],
      [12, 72],
      [38, 82],
      [82, 13],
      [13, 38],
      [63, 68],
      [68, 71],
      [71, 63],
      [226, 35],
      [35, 111],
      [111, 226],
      [101, 50],
      [50, 205],
      [205, 101],
      [206, 92],
      [92, 165],
      [165, 206],
      [209, 198],
      [198, 217],
      [217, 209],
      [165, 167],
      [167, 97],
      [97, 165],
      [220, 115],
      [115, 218],
      [218, 220],
      [133, 112],
      [112, 243],
      [243, 133],
      [239, 238],
      [238, 241],
      [241, 239],
      [214, 135],
      [135, 169],
      [169, 214],
      [190, 173],
      [173, 133],
      [133, 190],
      [171, 208],
      [208, 32],
      [32, 171],
      [125, 44],
      [44, 237],
      [237, 125],
      [86, 87],
      [87, 178],
      [178, 86],
      [85, 86],
      [86, 179],
      [179, 85],
      [84, 85],
      [85, 180],
      [180, 84],
      [83, 84],
      [84, 181],
      [181, 83],
      [201, 83],
      [83, 182],
      [182, 201],
      [137, 93],
      [93, 132],
      [132, 137],
      [76, 62],
      [62, 183],
      [183, 76],
      [61, 76],
      [76, 184],
      [184, 61],
      [57, 61],
      [61, 185],
      [185, 57],
      [212, 57],
      [57, 186],
      [186, 212],
      [214, 207],
      [207, 187],
      [187, 214],
      [34, 143],
      [143, 156],
      [156, 34],
      [79, 239],
      [239, 237],
      [237, 79],
      [123, 137],
      [137, 177],
      [177, 123],
      [44, 1],
      [1, 4],
      [4, 44],
      [201, 194],
      [194, 32],
      [32, 201],
      [64, 102],
      [102, 129],
      [129, 64],
      [213, 215],
      [215, 138],
      [138, 213],
      [59, 166],
      [166, 219],
      [219, 59],
      [242, 99],
      [99, 97],
      [97, 242],
      [2, 94],
      [94, 141],
      [141, 2],
      [75, 59],
      [59, 235],
      [235, 75],
      [24, 110],
      [110, 228],
      [228, 24],
      [25, 130],
      [130, 226],
      [226, 25],
      [23, 24],
      [24, 229],
      [229, 23],
      [22, 23],
      [23, 230],
      [230, 22],
      [26, 22],
      [22, 231],
      [231, 26],
      [112, 26],
      [26, 232],
      [232, 112],
      [189, 190],
      [190, 243],
      [243, 189],
      [221, 56],
      [56, 190],
      [190, 221],
      [28, 56],
      [56, 221],
      [221, 28],
      [27, 28],
      [28, 222],
      [222, 27],
      [29, 27],
      [27, 223],
      [223, 29],
      [30, 29],
      [29, 224],
      [224, 30],
      [247, 30],
      [30, 225],
      [225, 247],
      [238, 79],
      [79, 20],
      [20, 238],
      [166, 59],
      [59, 75],
      [75, 166],
      [60, 75],
      [75, 240],
      [240, 60],
      [147, 177],
      [177, 215],
      [215, 147],
      [20, 79],
      [79, 166],
      [166, 20],
      [187, 147],
      [147, 213],
      [213, 187],
      [112, 233],
      [233, 244],
      [244, 112],
      [233, 128],
      [128, 245],
      [245, 233],
      [128, 114],
      [114, 188],
      [188, 128],
      [114, 217],
      [217, 174],
      [174, 114],
      [131, 115],
      [115, 220],
      [220, 131],
      [217, 198],
      [198, 236],
      [236, 217],
      [198, 131],
      [131, 134],
      [134, 198],
      [177, 132],
      [132, 58],
      [58, 177],
      [143, 35],
      [35, 124],
      [124, 143],
      [110, 163],
      [163, 7],
      [7, 110],
      [228, 110],
      [110, 25],
      [25, 228],
      [356, 389],
      [389, 368],
      [368, 356],
      [11, 302],
      [302, 267],
      [267, 11],
      [452, 350],
      [350, 349],
      [349, 452],
      [302, 303],
      [303, 269],
      [269, 302],
      [357, 343],
      [343, 277],
      [277, 357],
      [452, 453],
      [453, 357],
      [357, 452],
      [333, 332],
      [332, 297],
      [297, 333],
      [175, 152],
      [152, 377],
      [377, 175],
      [347, 348],
      [348, 330],
      [330, 347],
      [303, 304],
      [304, 270],
      [270, 303],
      [9, 336],
      [336, 337],
      [337, 9],
      [278, 279],
      [279, 360],
      [360, 278],
      [418, 262],
      [262, 431],
      [431, 418],
      [304, 408],
      [408, 409],
      [409, 304],
      [310, 415],
      [415, 407],
      [407, 310],
      [270, 409],
      [409, 410],
      [410, 270],
      [450, 348],
      [348, 347],
      [347, 450],
      [422, 430],
      [430, 434],
      [434, 422],
      [313, 314],
      [314, 17],
      [17, 313],
      [306, 307],
      [307, 375],
      [375, 306],
      [387, 388],
      [388, 260],
      [260, 387],
      [286, 414],
      [414, 398],
      [398, 286],
      [335, 406],
      [406, 418],
      [418, 335],
      [364, 367],
      [367, 416],
      [416, 364],
      [423, 358],
      [358, 327],
      [327, 423],
      [251, 284],
      [284, 298],
      [298, 251],
      [281, 5],
      [5, 4],
      [4, 281],
      [373, 374],
      [374, 253],
      [253, 373],
      [307, 320],
      [320, 321],
      [321, 307],
      [425, 427],
      [427, 411],
      [411, 425],
      [421, 313],
      [313, 18],
      [18, 421],
      [321, 405],
      [405, 406],
      [406, 321],
      [320, 404],
      [404, 405],
      [405, 320],
      [315, 16],
      [16, 17],
      [17, 315],
      [426, 425],
      [425, 266],
      [266, 426],
      [377, 400],
      [400, 369],
      [369, 377],
      [322, 391],
      [391, 269],
      [269, 322],
      [417, 465],
      [465, 464],
      [464, 417],
      [386, 257],
      [257, 258],
      [258, 386],
      [466, 260],
      [260, 388],
      [388, 466],
      [456, 399],
      [399, 419],
      [419, 456],
      [284, 332],
      [332, 333],
      [333, 284],
      [417, 285],
      [285, 8],
      [8, 417],
      [346, 340],
      [340, 261],
      [261, 346],
      [413, 441],
      [441, 285],
      [285, 413],
      [327, 460],
      [460, 328],
      [328, 327],
      [355, 371],
      [371, 329],
      [329, 355],
      [392, 439],
      [439, 438],
      [438, 392],
      [382, 341],
      [341, 256],
      [256, 382],
      [429, 420],
      [420, 360],
      [360, 429],
      [364, 394],
      [394, 379],
      [379, 364],
      [277, 343],
      [343, 437],
      [437, 277],
      [443, 444],
      [444, 283],
      [283, 443],
      [275, 440],
      [440, 363],
      [363, 275],
      [431, 262],
      [262, 369],
      [369, 431],
      [297, 338],
      [338, 337],
      [337, 297],
      [273, 375],
      [375, 321],
      [321, 273],
      [450, 451],
      [451, 349],
      [349, 450],
      [446, 342],
      [342, 467],
      [467, 446],
      [293, 334],
      [334, 282],
      [282, 293],
      [458, 461],
      [461, 462],
      [462, 458],
      [276, 353],
      [353, 383],
      [383, 276],
      [308, 324],
      [324, 325],
      [325, 308],
      [276, 300],
      [300, 293],
      [293, 276],
      [372, 345],
      [345, 447],
      [447, 372],
      [352, 345],
      [345, 340],
      [340, 352],
      [274, 1],
      [1, 19],
      [19, 274],
      [456, 248],
      [248, 281],
      [281, 456],
      [436, 427],
      [427, 425],
      [425, 436],
      [381, 256],
      [256, 252],
      [252, 381],
      [269, 391],
      [391, 393],
      [393, 269],
      [200, 199],
      [199, 428],
      [428, 200],
      [266, 330],
      [330, 329],
      [329, 266],
      [287, 273],
      [273, 422],
      [422, 287],
      [250, 462],
      [462, 328],
      [328, 250],
      [258, 286],
      [286, 384],
      [384, 258],
      [265, 353],
      [353, 342],
      [342, 265],
      [387, 259],
      [259, 257],
      [257, 387],
      [424, 431],
      [431, 430],
      [430, 424],
      [342, 353],
      [353, 276],
      [276, 342],
      [273, 335],
      [335, 424],
      [424, 273],
      [292, 325],
      [325, 307],
      [307, 292],
      [366, 447],
      [447, 345],
      [345, 366],
      [271, 303],
      [303, 302],
      [302, 271],
      [423, 266],
      [266, 371],
      [371, 423],
      [294, 455],
      [455, 460],
      [460, 294],
      [279, 278],
      [278, 294],
      [294, 279],
      [271, 272],
      [272, 304],
      [304, 271],
      [432, 434],
      [434, 427],
      [427, 432],
      [272, 407],
      [407, 408],
      [408, 272],
      [394, 430],
      [430, 431],
      [431, 394],
      [395, 369],
      [369, 400],
      [400, 395],
      [334, 333],
      [333, 299],
      [299, 334],
      [351, 417],
      [417, 168],
      [168, 351],
      [352, 280],
      [280, 411],
      [411, 352],
      [325, 319],
      [319, 320],
      [320, 325],
      [295, 296],
      [296, 336],
      [336, 295],
      [319, 403],
      [403, 404],
      [404, 319],
      [330, 348],
      [348, 349],
      [349, 330],
      [293, 298],
      [298, 333],
      [333, 293],
      [323, 454],
      [454, 447],
      [447, 323],
      [15, 16],
      [16, 315],
      [315, 15],
      [358, 429],
      [429, 279],
      [279, 358],
      [14, 15],
      [15, 316],
      [316, 14],
      [285, 336],
      [336, 9],
      [9, 285],
      [329, 349],
      [349, 350],
      [350, 329],
      [374, 380],
      [380, 252],
      [252, 374],
      [318, 402],
      [402, 403],
      [403, 318],
      [6, 197],
      [197, 419],
      [419, 6],
      [318, 319],
      [319, 325],
      [325, 318],
      [367, 364],
      [364, 365],
      [365, 367],
      [435, 367],
      [367, 397],
      [397, 435],
      [344, 438],
      [438, 439],
      [439, 344],
      [272, 271],
      [271, 311],
      [311, 272],
      [195, 5],
      [5, 281],
      [281, 195],
      [273, 287],
      [287, 291],
      [291, 273],
      [396, 428],
      [428, 199],
      [199, 396],
      [311, 271],
      [271, 268],
      [268, 311],
      [283, 444],
      [444, 445],
      [445, 283],
      [373, 254],
      [254, 339],
      [339, 373],
      [282, 334],
      [334, 296],
      [296, 282],
      [449, 347],
      [347, 346],
      [346, 449],
      [264, 447],
      [447, 454],
      [454, 264],
      [336, 296],
      [296, 299],
      [299, 336],
      [338, 10],
      [10, 151],
      [151, 338],
      [278, 439],
      [439, 455],
      [455, 278],
      [292, 407],
      [407, 415],
      [415, 292],
      [358, 371],
      [371, 355],
      [355, 358],
      [340, 345],
      [345, 372],
      [372, 340],
      [346, 347],
      [347, 280],
      [280, 346],
      [442, 443],
      [443, 282],
      [282, 442],
      [19, 94],
      [94, 370],
      [370, 19],
      [441, 442],
      [442, 295],
      [295, 441],
      [248, 419],
      [419, 197],
      [197, 248],
      [263, 255],
      [255, 359],
      [359, 263],
      [440, 275],
      [275, 274],
      [274, 440],
      [300, 383],
      [383, 368],
      [368, 300],
      [351, 412],
      [412, 465],
      [465, 351],
      [263, 467],
      [467, 466],
      [466, 263],
      [301, 368],
      [368, 389],
      [389, 301],
      [395, 378],
      [378, 379],
      [379, 395],
      [412, 351],
      [351, 419],
      [419, 412],
      [436, 426],
      [426, 322],
      [322, 436],
      [2, 164],
      [164, 393],
      [393, 2],
      [370, 462],
      [462, 461],
      [461, 370],
      [164, 0],
      [0, 267],
      [267, 164],
      [302, 11],
      [11, 12],
      [12, 302],
      [268, 12],
      [12, 13],
      [13, 268],
      [293, 300],
      [300, 301],
      [301, 293],
      [446, 261],
      [261, 340],
      [340, 446],
      [330, 266],
      [266, 425],
      [425, 330],
      [426, 423],
      [423, 391],
      [391, 426],
      [429, 355],
      [355, 437],
      [437, 429],
      [391, 327],
      [327, 326],
      [326, 391],
      [440, 457],
      [457, 438],
      [438, 440],
      [341, 382],
      [382, 362],
      [362, 341],
      [459, 457],
      [457, 461],
      [461, 459],
      [434, 430],
      [430, 394],
      [394, 434],
      [414, 463],
      [463, 362],
      [362, 414],
      [396, 369],
      [369, 262],
      [262, 396],
      [354, 461],
      [461, 457],
      [457, 354],
      [316, 403],
      [403, 402],
      [402, 316],
      [315, 404],
      [404, 403],
      [403, 315],
      [314, 405],
      [405, 404],
      [404, 314],
      [313, 406],
      [406, 405],
      [405, 313],
      [421, 418],
      [418, 406],
      [406, 421],
      [366, 401],
      [401, 361],
      [361, 366],
      [306, 408],
      [408, 407],
      [407, 306],
      [291, 409],
      [409, 408],
      [408, 291],
      [287, 410],
      [410, 409],
      [409, 287],
      [432, 436],
      [436, 410],
      [410, 432],
      [434, 416],
      [416, 411],
      [411, 434],
      [264, 368],
      [368, 383],
      [383, 264],
      [309, 438],
      [438, 457],
      [457, 309],
      [352, 376],
      [376, 401],
      [401, 352],
      [274, 275],
      [275, 4],
      [4, 274],
      [421, 428],
      [428, 262],
      [262, 421],
      [294, 327],
      [327, 358],
      [358, 294],
      [433, 416],
      [416, 367],
      [367, 433],
      [289, 455],
      [455, 439],
      [439, 289],
      [462, 370],
      [370, 326],
      [326, 462],
      [2, 326],
      [326, 370],
      [370, 2],
      [305, 460],
      [460, 455],
      [455, 305],
      [254, 449],
      [449, 448],
      [448, 254],
      [255, 261],
      [261, 446],
      [446, 255],
      [253, 450],
      [450, 449],
      [449, 253],
      [252, 451],
      [451, 450],
      [450, 252],
      [256, 452],
      [452, 451],
      [451, 256],
      [341, 453],
      [453, 452],
      [452, 341],
      [413, 464],
      [464, 463],
      [463, 413],
      [441, 413],
      [413, 414],
      [414, 441],
      [258, 442],
      [442, 441],
      [441, 258],
      [257, 443],
      [443, 442],
      [442, 257],
      [259, 444],
      [444, 443],
      [443, 259],
      [260, 445],
      [445, 444],
      [444, 260],
      [467, 342],
      [342, 445],
      [445, 467],
      [459, 458],
      [458, 250],
      [250, 459],
      [289, 392],
      [392, 290],
      [290, 289],
      [290, 328],
      [328, 460],
      [460, 290],
      [376, 433],
      [433, 435],
      [435, 376],
      [250, 290],
      [290, 392],
      [392, 250],
      [411, 416],
      [416, 433],
      [433, 411],
      [341, 463],
      [463, 464],
      [464, 341],
      [453, 464],
      [464, 465],
      [465, 453],
      [357, 465],
      [465, 412],
      [412, 357],
      [343, 412],
      [412, 399],
      [399, 343],
      [360, 363],
      [363, 440],
      [440, 360],
      [437, 399],
      [399, 456],
      [456, 437],
      [420, 456],
      [456, 363],
      [363, 420],
      [401, 435],
      [435, 288],
      [288, 401],
      [372, 383],
      [383, 353],
      [353, 372],
      [339, 255],
      [255, 249],
      [249, 339],
      [448, 261],
      [261, 255],
      [255, 448],
      [133, 243],
      [243, 190],
      [190, 133],
      [133, 155],
      [155, 112],
      [112, 133],
      [33, 246],
      [246, 247],
      [247, 33],
      [33, 130],
      [130, 25],
      [25, 33],
      [398, 384],
      [384, 286],
      [286, 398],
      [362, 398],
      [398, 414],
      [414, 362],
      [362, 463],
      [463, 341],
      [341, 362],
      [263, 359],
      [359, 467],
      [467, 263],
      [263, 249],
      [249, 255],
      [255, 263],
      [466, 467],
      [467, 260],
      [260, 466],
      [75, 60],
      [60, 166],
      [166, 75],
      [238, 239],
      [239, 79],
      [79, 238],
      [162, 127],
      [127, 139],
      [139, 162],
      [72, 11],
      [11, 37],
      [37, 72],
      [121, 232],
      [232, 120],
      [120, 121],
      [73, 72],
      [72, 39],
      [39, 73],
      [114, 128],
      [128, 47],
      [47, 114],
      [233, 232],
      [232, 128],
      [128, 233],
      [103, 104],
      [104, 67],
      [67, 103],
      [152, 175],
      [175, 148],
      [148, 152],
      [119, 118],
      [118, 101],
      [101, 119],
      [74, 73],
      [73, 40],
      [40, 74],
      [107, 9],
      [9, 108],
      [108, 107],
      [49, 48],
      [48, 131],
      [131, 49],
      [32, 194],
      [194, 211],
      [211, 32],
      [184, 74],
      [74, 185],
      [185, 184],
      [191, 80],
      [80, 183],
      [183, 191],
      [185, 40],
      [40, 186],
      [186, 185],
      [119, 230],
      [230, 118],
      [118, 119],
      [210, 202],
      [202, 214],
      [214, 210],
      [84, 83],
      [83, 17],
      [17, 84],
      [77, 76],
      [76, 146],
      [146, 77],
      [161, 160],
      [160, 30],
      [30, 161],
      [190, 56],
      [56, 173],
      [173, 190],
      [182, 106],
      [106, 194],
      [194, 182],
      [138, 135],
      [135, 192],
      [192, 138],
      [129, 203],
      [203, 98],
      [98, 129],
      [54, 21],
      [21, 68],
      [68, 54],
      [5, 51],
      [51, 4],
      [4, 5],
      [145, 144],
      [144, 23],
      [23, 145],
      [90, 77],
      [77, 91],
      [91, 90],
      [207, 205],
      [205, 187],
      [187, 207],
      [83, 201],
      [201, 18],
      [18, 83],
      [181, 91],
      [91, 182],
      [182, 181],
      [180, 90],
      [90, 181],
      [181, 180],
      [16, 85],
      [85, 17],
      [17, 16],
      [205, 206],
      [206, 36],
      [36, 205],
      [176, 148],
      [148, 140],
      [140, 176],
      [165, 92],
      [92, 39],
      [39, 165],
      [245, 193],
      [193, 244],
      [244, 245],
      [27, 159],
      [159, 28],
      [28, 27],
      [30, 247],
      [247, 161],
      [161, 30],
      [174, 236],
      [236, 196],
      [196, 174],
      [103, 54],
      [54, 104],
      [104, 103],
      [55, 193],
      [193, 8],
      [8, 55],
      [111, 117],
      [117, 31],
      [31, 111],
      [221, 189],
      [189, 55],
      [55, 221],
      [240, 98],
      [98, 99],
      [99, 240],
      [142, 126],
      [126, 100],
      [100, 142],
      [219, 166],
      [166, 218],
      [218, 219],
      [112, 155],
      [155, 26],
      [26, 112],
      [198, 209],
      [209, 131],
      [131, 198],
      [169, 135],
      [135, 150],
      [150, 169],
      [114, 47],
      [47, 217],
      [217, 114],
      [224, 223],
      [223, 53],
      [53, 224],
      [220, 45],
      [45, 134],
      [134, 220],
      [32, 211],
      [211, 140],
      [140, 32],
      [109, 67],
      [67, 108],
      [108, 109],
      [146, 43],
      [43, 91],
      [91, 146],
      [231, 230],
      [230, 120],
      [120, 231],
      [113, 226],
      [226, 247],
      [247, 113],
      [105, 63],
      [63, 52],
      [52, 105],
      [241, 238],
      [238, 242],
      [242, 241],
      [124, 46],
      [46, 156],
      [156, 124],
      [95, 78],
      [78, 96],
      [96, 95],
      [70, 46],
      [46, 63],
      [63, 70],
      [116, 143],
      [143, 227],
      [227, 116],
      [116, 123],
      [123, 111],
      [111, 116],
      [1, 44],
      [44, 19],
      [19, 1],
      [3, 236],
      [236, 51],
      [51, 3],
      [207, 216],
      [216, 205],
      [205, 207],
      [26, 154],
      [154, 22],
      [22, 26],
      [165, 39],
      [39, 167],
      [167, 165],
      [199, 200],
      [200, 208],
      [208, 199],
      [101, 36],
      [36, 100],
      [100, 101],
      [43, 57],
      [57, 202],
      [202, 43],
      [242, 20],
      [20, 99],
      [99, 242],
      [56, 28],
      [28, 157],
      [157, 56],
      [124, 35],
      [35, 113],
      [113, 124],
      [29, 160],
      [160, 27],
      [27, 29],
      [211, 204],
      [204, 210],
      [210, 211],
      [124, 113],
      [113, 46],
      [46, 124],
      [106, 43],
      [43, 204],
      [204, 106],
      [96, 62],
      [62, 77],
      [77, 96],
      [227, 137],
      [137, 116],
      [116, 227],
      [73, 41],
      [41, 72],
      [72, 73],
      [36, 203],
      [203, 142],
      [142, 36],
      [235, 64],
      [64, 240],
      [240, 235],
      [48, 49],
      [49, 64],
      [64, 48],
      [42, 41],
      [41, 74],
      [74, 42],
      [214, 212],
      [212, 207],
      [207, 214],
      [183, 42],
      [42, 184],
      [184, 183],
      [210, 169],
      [169, 211],
      [211, 210],
      [140, 170],
      [170, 176],
      [176, 140],
      [104, 105],
      [105, 69],
      [69, 104],
      [193, 122],
      [122, 168],
      [168, 193],
      [50, 123],
      [123, 187],
      [187, 50],
      [89, 96],
      [96, 90],
      [90, 89],
      [66, 65],
      [65, 107],
      [107, 66],
      [179, 89],
      [89, 180],
      [180, 179],
      [119, 101],
      [101, 120],
      [120, 119],
      [68, 63],
      [63, 104],
      [104, 68],
      [234, 93],
      [93, 227],
      [227, 234],
      [16, 15],
      [15, 85],
      [85, 16],
      [209, 129],
      [129, 49],
      [49, 209],
      [15, 14],
      [14, 86],
      [86, 15],
      [107, 55],
      [55, 9],
      [9, 107],
      [120, 100],
      [100, 121],
      [121, 120],
      [153, 145],
      [145, 22],
      [22, 153],
      [178, 88],
      [88, 179],
      [179, 178],
      [197, 6],
      [6, 196],
      [196, 197],
      [89, 88],
      [88, 96],
      [96, 89],
      [135, 138],
      [138, 136],
      [136, 135],
      [138, 215],
      [215, 172],
      [172, 138],
      [218, 115],
      [115, 219],
      [219, 218],
      [41, 42],
      [42, 81],
      [81, 41],
      [5, 195],
      [195, 51],
      [51, 5],
      [57, 43],
      [43, 61],
      [61, 57],
      [208, 171],
      [171, 199],
      [199, 208],
      [41, 81],
      [81, 38],
      [38, 41],
      [224, 53],
      [53, 225],
      [225, 224],
      [24, 144],
      [144, 110],
      [110, 24],
      [105, 52],
      [52, 66],
      [66, 105],
      [118, 229],
      [229, 117],
      [117, 118],
      [227, 34],
      [34, 234],
      [234, 227],
      [66, 107],
      [107, 69],
      [69, 66],
      [10, 109],
      [109, 151],
      [151, 10],
      [219, 48],
      [48, 235],
      [235, 219],
      [183, 62],
      [62, 191],
      [191, 183],
      [142, 129],
      [129, 126],
      [126, 142],
      [116, 111],
      [111, 143],
      [143, 116],
      [118, 117],
      [117, 50],
      [50, 118],
      [223, 222],
      [222, 52],
      [52, 223],
      [94, 19],
      [19, 141],
      [141, 94],
      [222, 221],
      [221, 65],
      [65, 222],
      [196, 3],
      [3, 197],
      [197, 196],
      [45, 220],
      [220, 44],
      [44, 45],
      [156, 70],
      [70, 139],
      [139, 156],
      [188, 122],
      [122, 245],
      [245, 188],
      [139, 71],
      [71, 162],
      [162, 139],
      [149, 170],
      [170, 150],
      [150, 149],
      [122, 188],
      [188, 196],
      [196, 122],
      [206, 216],
      [216, 92],
      [92, 206],
      [164, 2],
      [2, 167],
      [167, 164],
      [242, 141],
      [141, 241],
      [241, 242],
      [0, 164],
      [164, 37],
      [37, 0],
      [11, 72],
      [72, 12],
      [12, 11],
      [12, 38],
      [38, 13],
      [13, 12],
      [70, 63],
      [63, 71],
      [71, 70],
      [31, 226],
      [226, 111],
      [111, 31],
      [36, 101],
      [101, 205],
      [205, 36],
      [203, 206],
      [206, 165],
      [165, 203],
      [126, 209],
      [209, 217],
      [217, 126],
      [98, 165],
      [165, 97],
      [97, 98],
      [237, 220],
      [220, 218],
      [218, 237],
      [237, 239],
      [239, 241],
      [241, 237],
      [210, 214],
      [214, 169],
      [169, 210],
      [140, 171],
      [171, 32],
      [32, 140],
      [241, 125],
      [125, 237],
      [237, 241],
      [179, 86],
      [86, 178],
      [178, 179],
      [180, 85],
      [85, 179],
      [179, 180],
      [181, 84],
      [84, 180],
      [180, 181],
      [182, 83],
      [83, 181],
      [181, 182],
      [194, 201],
      [201, 182],
      [182, 194],
      [177, 137],
      [137, 132],
      [132, 177],
      [184, 76],
      [76, 183],
      [183, 184],
      [185, 61],
      [61, 184],
      [184, 185],
      [186, 57],
      [57, 185],
      [185, 186],
      [216, 212],
      [212, 186],
      [186, 216],
      [192, 214],
      [214, 187],
      [187, 192],
      [139, 34],
      [34, 156],
      [156, 139],
      [218, 79],
      [79, 237],
      [237, 218],
      [147, 123],
      [123, 177],
      [177, 147],
      [45, 44],
      [44, 4],
      [4, 45],
      [208, 201],
      [201, 32],
      [32, 208],
      [98, 64],
      [64, 129],
      [129, 98],
      [192, 213],
      [213, 138],
      [138, 192],
      [235, 59],
      [59, 219],
      [219, 235],
      [141, 242],
      [242, 97],
      [97, 141],
      [97, 2],
      [2, 141],
      [141, 97],
      [240, 75],
      [75, 235],
      [235, 240],
      [229, 24],
      [24, 228],
      [228, 229],
      [31, 25],
      [25, 226],
      [226, 31],
      [230, 23],
      [23, 229],
      [229, 230],
      [231, 22],
      [22, 230],
      [230, 231],
      [232, 26],
      [26, 231],
      [231, 232],
      [233, 112],
      [112, 232],
      [232, 233],
      [244, 189],
      [189, 243],
      [243, 244],
      [189, 221],
      [221, 190],
      [190, 189],
      [222, 28],
      [28, 221],
      [221, 222],
      [223, 27],
      [27, 222],
      [222, 223],
      [224, 29],
      [29, 223],
      [223, 224],
      [225, 30],
      [30, 224],
      [224, 225],
      [113, 247],
      [247, 225],
      [225, 113],
      [99, 60],
      [60, 240],
      [240, 99],
      [213, 147],
      [147, 215],
      [215, 213],
      [60, 20],
      [20, 166],
      [166, 60],
      [192, 187],
      [187, 213],
      [213, 192],
      [243, 112],
      [112, 244],
      [244, 243],
      [244, 233],
      [233, 245],
      [245, 244],
      [245, 128],
      [128, 188],
      [188, 245],
      [188, 114],
      [114, 174],
      [174, 188],
      [134, 131],
      [131, 220],
      [220, 134],
      [174, 217],
      [217, 236],
      [236, 174],
      [236, 198],
      [198, 134],
      [134, 236],
      [215, 177],
      [177, 58],
      [58, 215],
      [156, 143],
      [143, 124],
      [124, 156],
      [25, 110],
      [110, 7],
      [7, 25],
      [31, 228],
      [228, 25],
      [25, 31],
      [264, 356],
      [356, 368],
      [368, 264],
      [0, 11],
      [11, 267],
      [267, 0],
      [451, 452],
      [452, 349],
      [349, 451],
      [267, 302],
      [302, 269],
      [269, 267],
      [350, 357],
      [357, 277],
      [277, 350],
      [350, 452],
      [452, 357],
      [357, 350],
      [299, 333],
      [333, 297],
      [297, 299],
      [396, 175],
      [175, 377],
      [377, 396],
      [280, 347],
      [347, 330],
      [330, 280],
      [269, 303],
      [303, 270],
      [270, 269],
      [151, 9],
      [9, 337],
      [337, 151],
      [344, 278],
      [278, 360],
      [360, 344],
      [424, 418],
      [418, 431],
      [431, 424],
      [270, 304],
      [304, 409],
      [409, 270],
      [272, 310],
      [310, 407],
      [407, 272],
      [322, 270],
      [270, 410],
      [410, 322],
      [449, 450],
      [450, 347],
      [347, 449],
      [432, 422],
      [422, 434],
      [434, 432],
      [18, 313],
      [313, 17],
      [17, 18],
      [291, 306],
      [306, 375],
      [375, 291],
      [259, 387],
      [387, 260],
      [260, 259],
      [424, 335],
      [335, 418],
      [418, 424],
      [434, 364],
      [364, 416],
      [416, 434],
      [391, 423],
      [423, 327],
      [327, 391],
      [301, 251],
      [251, 298],
      [298, 301],
      [275, 281],
      [281, 4],
      [4, 275],
      [254, 373],
      [373, 253],
      [253, 254],
      [375, 307],
      [307, 321],
      [321, 375],
      [280, 425],
      [425, 411],
      [411, 280],
      [200, 421],
      [421, 18],
      [18, 200],
      [335, 321],
      [321, 406],
      [406, 335],
      [321, 320],
      [320, 405],
      [405, 321],
      [314, 315],
      [315, 17],
      [17, 314],
      [423, 426],
      [426, 266],
      [266, 423],
      [396, 377],
      [377, 369],
      [369, 396],
      [270, 322],
      [322, 269],
      [269, 270],
      [413, 417],
      [417, 464],
      [464, 413],
      [385, 386],
      [386, 258],
      [258, 385],
      [248, 456],
      [456, 419],
      [419, 248],
      [298, 284],
      [284, 333],
      [333, 298],
      [168, 417],
      [417, 8],
      [8, 168],
      [448, 346],
      [346, 261],
      [261, 448],
      [417, 413],
      [413, 285],
      [285, 417],
      [326, 327],
      [327, 328],
      [328, 326],
      [277, 355],
      [355, 329],
      [329, 277],
      [309, 392],
      [392, 438],
      [438, 309],
      [381, 382],
      [382, 256],
      [256, 381],
      [279, 429],
      [429, 360],
      [360, 279],
      [365, 364],
      [364, 379],
      [379, 365],
      [355, 277],
      [277, 437],
      [437, 355],
      [282, 443],
      [443, 283],
      [283, 282],
      [281, 275],
      [275, 363],
      [363, 281],
      [395, 431],
      [431, 369],
      [369, 395],
      [299, 297],
      [297, 337],
      [337, 299],
      [335, 273],
      [273, 321],
      [321, 335],
      [348, 450],
      [450, 349],
      [349, 348],
      [359, 446],
      [446, 467],
      [467, 359],
      [283, 293],
      [293, 282],
      [282, 283],
      [250, 458],
      [458, 462],
      [462, 250],
      [300, 276],
      [276, 383],
      [383, 300],
      [292, 308],
      [308, 325],
      [325, 292],
      [283, 276],
      [276, 293],
      [293, 283],
      [264, 372],
      [372, 447],
      [447, 264],
      [346, 352],
      [352, 340],
      [340, 346],
      [354, 274],
      [274, 19],
      [19, 354],
      [363, 456],
      [456, 281],
      [281, 363],
      [426, 436],
      [436, 425],
      [425, 426],
      [380, 381],
      [381, 252],
      [252, 380],
      [267, 269],
      [269, 393],
      [393, 267],
      [421, 200],
      [200, 428],
      [428, 421],
      [371, 266],
      [266, 329],
      [329, 371],
      [432, 287],
      [287, 422],
      [422, 432],
      [290, 250],
      [250, 328],
      [328, 290],
      [385, 258],
      [258, 384],
      [384, 385],
      [446, 265],
      [265, 342],
      [342, 446],
      [386, 387],
      [387, 257],
      [257, 386],
      [422, 424],
      [424, 430],
      [430, 422],
      [445, 342],
      [342, 276],
      [276, 445],
      [422, 273],
      [273, 424],
      [424, 422],
      [306, 292],
      [292, 307],
      [307, 306],
      [352, 366],
      [366, 345],
      [345, 352],
      [268, 271],
      [271, 302],
      [302, 268],
      [358, 423],
      [423, 371],
      [371, 358],
      [327, 294],
      [294, 460],
      [460, 327],
      [331, 279],
      [279, 294],
      [294, 331],
      [303, 271],
      [271, 304],
      [304, 303],
      [436, 432],
      [432, 427],
      [427, 436],
      [304, 272],
      [272, 408],
      [408, 304],
      [395, 394],
      [394, 431],
      [431, 395],
      [378, 395],
      [395, 400],
      [400, 378],
      [296, 334],
      [334, 299],
      [299, 296],
      [6, 351],
      [351, 168],
      [168, 6],
      [376, 352],
      [352, 411],
      [411, 376],
      [307, 325],
      [325, 320],
      [320, 307],
      [285, 295],
      [295, 336],
      [336, 285],
      [320, 319],
      [319, 404],
      [404, 320],
      [329, 330],
      [330, 349],
      [349, 329],
      [334, 293],
      [293, 333],
      [333, 334],
      [366, 323],
      [323, 447],
      [447, 366],
      [316, 15],
      [15, 315],
      [315, 316],
      [331, 358],
      [358, 279],
      [279, 331],
      [317, 14],
      [14, 316],
      [316, 317],
      [8, 285],
      [285, 9],
      [9, 8],
      [277, 329],
      [329, 350],
      [350, 277],
      [253, 374],
      [374, 252],
      [252, 253],
      [319, 318],
      [318, 403],
      [403, 319],
      [351, 6],
      [6, 419],
      [419, 351],
      [324, 318],
      [318, 325],
      [325, 324],
      [397, 367],
      [367, 365],
      [365, 397],
      [288, 435],
      [435, 397],
      [397, 288],
      [278, 344],
      [344, 439],
      [439, 278],
      [310, 272],
      [272, 311],
      [311, 310],
      [248, 195],
      [195, 281],
      [281, 248],
      [375, 273],
      [273, 291],
      [291, 375],
      [175, 396],
      [396, 199],
      [199, 175],
      [312, 311],
      [311, 268],
      [268, 312],
      [276, 283],
      [283, 445],
      [445, 276],
      [390, 373],
      [373, 339],
      [339, 390],
      [295, 282],
      [282, 296],
      [296, 295],
      [448, 449],
      [449, 346],
      [346, 448],
      [356, 264],
      [264, 454],
      [454, 356],
      [337, 336],
      [336, 299],
      [299, 337],
      [337, 338],
      [338, 151],
      [151, 337],
      [294, 278],
      [278, 455],
      [455, 294],
      [308, 292],
      [292, 415],
      [415, 308],
      [429, 358],
      [358, 355],
      [355, 429],
      [265, 340],
      [340, 372],
      [372, 265],
      [352, 346],
      [346, 280],
      [280, 352],
      [295, 442],
      [442, 282],
      [282, 295],
      [354, 19],
      [19, 370],
      [370, 354],
      [285, 441],
      [441, 295],
      [295, 285],
      [195, 248],
      [248, 197],
      [197, 195],
      [457, 440],
      [440, 274],
      [274, 457],
      [301, 300],
      [300, 368],
      [368, 301],
      [417, 351],
      [351, 465],
      [465, 417],
      [251, 301],
      [301, 389],
      [389, 251],
      [394, 395],
      [395, 379],
      [379, 394],
      [399, 412],
      [412, 419],
      [419, 399],
      [410, 436],
      [436, 322],
      [322, 410],
      [326, 2],
      [2, 393],
      [393, 326],
      [354, 370],
      [370, 461],
      [461, 354],
      [393, 164],
      [164, 267],
      [267, 393],
      [268, 302],
      [302, 12],
      [12, 268],
      [312, 268],
      [268, 13],
      [13, 312],
      [298, 293],
      [293, 301],
      [301, 298],
      [265, 446],
      [446, 340],
      [340, 265],
      [280, 330],
      [330, 425],
      [425, 280],
      [322, 426],
      [426, 391],
      [391, 322],
      [420, 429],
      [429, 437],
      [437, 420],
      [393, 391],
      [391, 326],
      [326, 393],
      [344, 440],
      [440, 438],
      [438, 344],
      [458, 459],
      [459, 461],
      [461, 458],
      [364, 434],
      [434, 394],
      [394, 364],
      [428, 396],
      [396, 262],
      [262, 428],
      [274, 354],
      [354, 457],
      [457, 274],
      [317, 316],
      [316, 402],
      [402, 317],
      [316, 315],
      [315, 403],
      [403, 316],
      [315, 314],
      [314, 404],
      [404, 315],
      [314, 313],
      [313, 405],
      [405, 314],
      [313, 421],
      [421, 406],
      [406, 313],
      [323, 366],
      [366, 361],
      [361, 323],
      [292, 306],
      [306, 407],
      [407, 292],
      [306, 291],
      [291, 408],
      [408, 306],
      [291, 287],
      [287, 409],
      [409, 291],
      [287, 432],
      [432, 410],
      [410, 287],
      [427, 434],
      [434, 411],
      [411, 427],
      [372, 264],
      [264, 383],
      [383, 372],
      [459, 309],
      [309, 457],
      [457, 459],
      [366, 352],
      [352, 401],
      [401, 366],
      [1, 274],
      [274, 4],
      [4, 1],
      [418, 421],
      [421, 262],
      [262, 418],
      [331, 294],
      [294, 358],
      [358, 331],
      [435, 433],
      [433, 367],
      [367, 435],
      [392, 289],
      [289, 439],
      [439, 392],
      [328, 462],
      [462, 326],
      [326, 328],
      [94, 2],
      [2, 370],
      [370, 94],
      [289, 305],
      [305, 455],
      [455, 289],
      [339, 254],
      [254, 448],
      [448, 339],
      [359, 255],
      [255, 446],
      [446, 359],
      [254, 253],
      [253, 449],
      [449, 254],
      [253, 252],
      [252, 450],
      [450, 253],
      [252, 256],
      [256, 451],
      [451, 252],
      [256, 341],
      [341, 452],
      [452, 256],
      [414, 413],
      [413, 463],
      [463, 414],
      [286, 441],
      [441, 414],
      [414, 286],
      [286, 258],
      [258, 441],
      [441, 286],
      [258, 257],
      [257, 442],
      [442, 258],
      [257, 259],
      [259, 443],
      [443, 257],
      [259, 260],
      [260, 444],
      [444, 259],
      [260, 467],
      [467, 445],
      [445, 260],
      [309, 459],
      [459, 250],
      [250, 309],
      [305, 289],
      [289, 290],
      [290, 305],
      [305, 290],
      [290, 460],
      [460, 305],
      [401, 376],
      [376, 435],
      [435, 401],
      [309, 250],
      [250, 392],
      [392, 309],
      [376, 411],
      [411, 433],
      [433, 376],
      [453, 341],
      [341, 464],
      [464, 453],
      [357, 453],
      [453, 465],
      [465, 357],
      [343, 357],
      [357, 412],
      [412, 343],
      [437, 343],
      [343, 399],
      [399, 437],
      [344, 360],
      [360, 440],
      [440, 344],
      [420, 437],
      [437, 456],
      [456, 420],
      [360, 420],
      [420, 363],
      [363, 360],
      [361, 401],
      [401, 288],
      [288, 361],
      [265, 372],
      [372, 353],
      [353, 265],
      [390, 339],
      [339, 249],
      [249, 390],
      [339, 448],
      [448, 255],
      [255, 339]
    );
  function hc(t) {
    t.j = {
      faceLandmarks: [],
      faceBlendshapes: [],
      facialTransformationMatrixes: [],
    };
  }
  var uc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect", false),
        (this.j = {
          faceLandmarks: [],
          faceBlendshapes: [],
          facialTransformationMatrixes: [],
        }),
        (this.outputFacialTransformationMatrixes = this.outputFaceBlendshapes =
          false),
        dn((t = this.h = new Bs()), 0, 1, (e = new Is())),
        (this.v = new Ns()),
        dn(this.h, 0, 3, this.v),
        (this.s = new Cs()),
        dn(this.h, 0, 2, this.s),
        Tn(this.s, 4, 1),
        An(this.s, 2, 0.5),
        An(this.v, 2, 0.5),
        An(this.h, 4, 0.5));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      return (
        "numFaces" in t && Tn(this.s, 4, t.numFaces ?? 1),
        "minFaceDetectionConfidence" in t &&
          An(this.s, 2, t.minFaceDetectionConfidence ?? 0.5),
        "minTrackingConfidence" in t &&
          An(this.h, 4, t.minTrackingConfidence ?? 0.5),
        "minFacePresenceConfidence" in t &&
          An(this.v, 2, t.minFacePresenceConfidence ?? 0.5),
        "outputFaceBlendshapes" in t &&
          (this.outputFaceBlendshapes = !!t.outputFaceBlendshapes),
        "outputFacialTransformationMatrixes" in t &&
          (this.outputFacialTransformationMatrixes =
            !!t.outputFacialTransformationMatrixes),
        this.l(t)
      );
    }
    D(t, e) {
      return (hc(this), Ya(this, t, e), this.j);
    }
    F(t, e, n) {
      return (hc(this), $a(this, t, n, e), this.j);
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"), Ji(t, "norm_rect"), Zi(t, "face_landmarks"));
      const e = new Gi();
      Yn(e, Vs, this.h);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.face_landmarker.FaceLandmarkerGraph"),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "NORM_RECT:norm_rect"),
        Wi(n, "NORM_LANDMARKS:face_landmarks"),
        n.o(e),
        qi(t, n),
        this.g.attachProtoVectorListener("face_landmarks", (t, e) => {
          for (const e of t) ((t = fs(e)), this.j.faceLandmarks.push(Lo(t)));
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("face_landmarks", (t) => {
          Yo(this, t);
        }),
        this.outputFaceBlendshapes &&
          (Zi(t, "blendshapes"),
          Wi(n, "BLENDSHAPES:blendshapes"),
          this.g.attachProtoVectorListener("blendshapes", (t, e) => {
            if (this.outputFaceBlendshapes)
              for (const e of t)
                ((t = ss(e)), this.j.faceBlendshapes.push(So(t.g() ?? [])));
            Yo(this, e);
          }),
          this.g.attachEmptyPacketListener("blendshapes", (t) => {
            Yo(this, t);
          })),
        this.outputFacialTransformationMatrixes &&
          (Zi(t, "face_geometry"),
          Wi(n, "FACE_GEOMETRY:face_geometry"),
          this.g.attachProtoVectorListener("face_geometry", (t, e) => {
            if (this.outputFacialTransformationMatrixes)
              for (const e of t)
                (t = hn(Ds(e), ps, 2)) &&
                  this.j.facialTransformationMatrixes.push({
                    rows: _n(t, 1) ?? 0 ?? 0,
                    columns: _n(t, 2) ?? 0 ?? 0,
                    data: $e(t, 3, qt, Ye()).slice() ?? [],
                  });
            Yo(this, e);
          }),
          this.g.attachEmptyPacketListener("face_geometry", (t) => {
            Yo(this, t);
          })),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((uc.prototype.detectForVideo = uc.prototype.F),
    (uc.prototype.detect = uc.prototype.D),
    (uc.prototype.setOptions = uc.prototype.o),
    (uc.createFromModelPath = function (t, e) {
      return za(uc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (uc.createFromModelBuffer = function (t, e) {
      return za(uc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (uc.createFromOptions = function (t, e) {
      return za(uc, t, e);
    }),
    (uc.FACE_LANDMARKS_LIPS = Qa),
    (uc.FACE_LANDMARKS_LEFT_EYE = tc),
    (uc.FACE_LANDMARKS_LEFT_EYEBROW = ec),
    (uc.FACE_LANDMARKS_LEFT_IRIS = nc),
    (uc.FACE_LANDMARKS_RIGHT_EYE = rc),
    (uc.FACE_LANDMARKS_RIGHT_EYEBROW = ic),
    (uc.FACE_LANDMARKS_RIGHT_IRIS = sc),
    (uc.FACE_LANDMARKS_FACE_OVAL = oc),
    (uc.FACE_LANDMARKS_CONTOURS = ac),
    (uc.FACE_LANDMARKS_TESSELATION = cc));
  var lc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect", true),
        dn((t = this.j = new Xs()), 0, 1, (e = new Is())));
    }
    get baseOptions() {
      return hn(this.j, Is, 1);
    }
    set baseOptions(t) {
      dn(this.j, 0, 1, t);
    }
    o(t) {
      return super.l(t);
    }
    Ka(t, e, n) {
      const r = "function" != typeof e ? e : {};
      if (
        ((this.h = "function" == typeof e ? e : n),
        Ya(this, t, r ?? {}),
        !this.h)
      )
        return this.s;
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"), Ji(t, "norm_rect"), Zi(t, "stylized_image"));
      const e = new Gi();
      Yn(e, Hs, this.j);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.face_stylizer.FaceStylizerGraph"),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "NORM_RECT:norm_rect"),
        Wi(n, "STYLIZED_IMAGE:stylized_image"),
        n.o(e),
        qi(t, n),
        this.g.V("stylized_image", (t, e) => {
          var n = !this.h,
            r = t.data,
            i = t.width;
          const s = i * (t = t.height);
          if (r instanceof Uint8Array)
            if (r.length === 3 * s) {
              const e = new Uint8ClampedArray(4 * s);
              for (let t = 0; t < s; ++t)
                ((e[4 * t] = r[3 * t]),
                  (e[4 * t + 1] = r[3 * t + 1]),
                  (e[4 * t + 2] = r[3 * t + 2]),
                  (e[4 * t + 3] = 255));
              r = new ImageData(e, i, t);
            } else {
              if (r.length !== 4 * s)
                throw Error("Unsupported channel count: " + r.length / s);
              r = new ImageData(
                new Uint8ClampedArray(r.buffer, r.byteOffset, r.length),
                i,
                t
              );
            }
          else if (!(r instanceof WebGLTexture))
            throw Error(`Unsupported format: ${r.constructor.name}`);
          ((i = new Ga([r], false, false, this.g.i.canvas, this.P, i, t)),
            (this.s = n = n ? i.clone() : i),
            this.h && this.h(n),
            Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("stylized_image", (t) => {
          ((this.s = null), this.h && this.h(null), Yo(this, t));
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((lc.prototype.stylize = lc.prototype.Ka),
    (lc.prototype.setOptions = lc.prototype.o),
    (lc.createFromModelPath = function (t, e) {
      return za(lc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (lc.createFromModelBuffer = function (t, e) {
      return za(lc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (lc.createFromOptions = function (t, e) {
      return za(lc, t, e);
    }));
  var dc = Va(
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [5, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [9, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [13, 17],
    [0, 17],
    [17, 18],
    [18, 19],
    [19, 20]
  );
  function fc(t) {
    ((t.gestures = []),
      (t.landmarks = []),
      (t.worldLandmarks = []),
      (t.handedness = []));
  }
  function pc(t) {
    return 0 === t.gestures.length
      ? {
          gestures: [],
          landmarks: [],
          worldLandmarks: [],
          handedness: [],
          handednesses: [],
        }
      : {
          gestures: t.gestures,
          landmarks: t.landmarks,
          worldLandmarks: t.worldLandmarks,
          handedness: t.handedness,
          handednesses: t.handedness,
        };
  }
  function gc(t, e = true) {
    const n = [];
    for (const i of t) {
      var r = ss(i);
      t = [];
      for (const n of r.g())
        ((r = e && null != _n(n, 1) ? (_n(n, 1) ?? 0) : -1),
          t.push({
            score: En(n, 2) ?? 0,
            index: r,
            categoryName: vn(n, 3) ?? "" ?? "",
            displayName: vn(n, 4) ?? "" ?? "",
          }));
      n.push(t);
    }
    return n;
  }
  var mc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect", false),
        (this.gestures = []),
        (this.landmarks = []),
        (this.worldLandmarks = []),
        (this.handedness = []),
        dn((t = this.j = new Js()), 0, 1, (e = new Is())),
        (this.s = new qs()),
        dn(this.j, 0, 2, this.s),
        (this.C = new $s()),
        dn(this.s, 0, 3, this.C),
        (this.v = new Ys()),
        dn(this.s, 0, 2, this.v),
        (this.h = new Ks()),
        dn(this.j, 0, 3, this.h),
        An(this.v, 2, 0.5),
        An(this.s, 4, 0.5),
        An(this.C, 2, 0.5));
    }
    get baseOptions() {
      return hn(this.j, Is, 1);
    }
    set baseOptions(t) {
      dn(this.j, 0, 1, t);
    }
    o(t) {
      if (
        (Tn(this.v, 3, t.numHands ?? 1),
        "minHandDetectionConfidence" in t &&
          An(this.v, 2, t.minHandDetectionConfidence ?? 0.5),
        "minTrackingConfidence" in t &&
          An(this.s, 4, t.minTrackingConfidence ?? 0.5),
        "minHandPresenceConfidence" in t &&
          An(this.C, 2, t.minHandPresenceConfidence ?? 0.5),
        t.cannedGesturesClassifierOptions)
      ) {
        var e = new Ws(),
          n = e,
          r = ko(t.cannedGesturesClassifierOptions, hn(this.h, Ws, 3)?.h());
        (dn(n, 0, 2, r), dn(this.h, 0, 3, e));
      } else
        void 0 === t.cannedGesturesClassifierOptions && hn(this.h, Ws, 3)?.g();
      return (
        t.customGesturesClassifierOptions
          ? (dn(
              (n = e = new Ws()),
              0,
              2,
              (r = ko(
                t.customGesturesClassifierOptions,
                hn(this.h, Ws, 4)?.h()
              ))
            ),
            dn(this.h, 0, 4, e))
          : void 0 === t.customGesturesClassifierOptions &&
            hn(this.h, Ws, 4)?.g(),
        this.l(t)
      );
    }
    Fa(t, e) {
      return (fc(this), Ya(this, t, e), pc(this));
    }
    Ga(t, e, n) {
      return (fc(this), $a(this, t, n, e), pc(this));
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"),
        Ji(t, "norm_rect"),
        Zi(t, "hand_gestures"),
        Zi(t, "hand_landmarks"),
        Zi(t, "world_hand_landmarks"),
        Zi(t, "handedness"));
      const e = new Gi();
      Yn(e, no, this.j);
      const n = new zi();
      (Xi(
        n,
        "mediapipe.tasks.vision.gesture_recognizer.GestureRecognizerGraph"
      ),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "NORM_RECT:norm_rect"),
        Wi(n, "HAND_GESTURES:hand_gestures"),
        Wi(n, "LANDMARKS:hand_landmarks"),
        Wi(n, "WORLD_LANDMARKS:world_hand_landmarks"),
        Wi(n, "HANDEDNESS:handedness"),
        n.o(e),
        qi(t, n),
        this.g.attachProtoVectorListener("hand_landmarks", (t, e) => {
          for (const e of t) {
            t = fs(e);
            const n = [];
            for (const e of ln(t, ds, 1))
              n.push({
                x: En(e, 1) ?? 0,
                y: En(e, 2) ?? 0,
                z: En(e, 3) ?? 0,
                visibility: En(e, 4) ?? 0,
              });
            this.landmarks.push(n);
          }
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("hand_landmarks", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoVectorListener("world_hand_landmarks", (t, e) => {
          for (const e of t) {
            t = ls(e);
            const n = [];
            for (const e of ln(t, us, 1))
              n.push({
                x: En(e, 1) ?? 0,
                y: En(e, 2) ?? 0,
                z: En(e, 3) ?? 0,
                visibility: En(e, 4) ?? 0,
              });
            this.worldLandmarks.push(n);
          }
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("world_hand_landmarks", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoVectorListener("hand_gestures", (t, e) => {
          (this.gestures.push(...gc(t, false)), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("hand_gestures", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoVectorListener("handedness", (t, e) => {
          (this.handedness.push(...gc(t)), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("handedness", (t) => {
          Yo(this, t);
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  function yc(t) {
    return {
      landmarks: t.landmarks,
      worldLandmarks: t.worldLandmarks,
      handednesses: t.handedness,
      handedness: t.handedness,
    };
  }
  ((mc.prototype.recognizeForVideo = mc.prototype.Ga),
    (mc.prototype.recognize = mc.prototype.Fa),
    (mc.prototype.setOptions = mc.prototype.o),
    (mc.createFromModelPath = function (t, e) {
      return za(mc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (mc.createFromModelBuffer = function (t, e) {
      return za(mc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (mc.createFromOptions = function (t, e) {
      return za(mc, t, e);
    }),
    (mc.HAND_CONNECTIONS = dc));
  var _c = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect", false),
        (this.landmarks = []),
        (this.worldLandmarks = []),
        (this.handedness = []),
        dn((t = this.h = new qs()), 0, 1, (e = new Is())),
        (this.s = new $s()),
        dn(this.h, 0, 3, this.s),
        (this.j = new Ys()),
        dn(this.h, 0, 2, this.j),
        Tn(this.j, 3, 1),
        An(this.j, 2, 0.5),
        An(this.s, 2, 0.5),
        An(this.h, 4, 0.5));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      return (
        "numHands" in t && Tn(this.j, 3, t.numHands ?? 1),
        "minHandDetectionConfidence" in t &&
          An(this.j, 2, t.minHandDetectionConfidence ?? 0.5),
        "minTrackingConfidence" in t &&
          An(this.h, 4, t.minTrackingConfidence ?? 0.5),
        "minHandPresenceConfidence" in t &&
          An(this.s, 2, t.minHandPresenceConfidence ?? 0.5),
        this.l(t)
      );
    }
    D(t, e) {
      return (
        (this.landmarks = []),
        (this.worldLandmarks = []),
        (this.handedness = []),
        Ya(this, t, e),
        yc(this)
      );
    }
    F(t, e, n) {
      return (
        (this.landmarks = []),
        (this.worldLandmarks = []),
        (this.handedness = []),
        $a(this, t, n, e),
        yc(this)
      );
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"),
        Ji(t, "norm_rect"),
        Zi(t, "hand_landmarks"),
        Zi(t, "world_hand_landmarks"),
        Zi(t, "handedness"));
      const e = new Gi();
      Yn(e, ro, this.h);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.hand_landmarker.HandLandmarkerGraph"),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "NORM_RECT:norm_rect"),
        Wi(n, "LANDMARKS:hand_landmarks"),
        Wi(n, "WORLD_LANDMARKS:world_hand_landmarks"),
        Wi(n, "HANDEDNESS:handedness"),
        n.o(e),
        qi(t, n),
        this.g.attachProtoVectorListener("hand_landmarks", (t, e) => {
          for (const e of t) ((t = fs(e)), this.landmarks.push(Lo(t)));
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("hand_landmarks", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoVectorListener("world_hand_landmarks", (t, e) => {
          for (const e of t) ((t = ls(e)), this.worldLandmarks.push(Ro(t)));
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("world_hand_landmarks", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoVectorListener("handedness", (t, e) => {
          var n = this.handedness,
            r = n.push;
          const i = [];
          for (const e of t) {
            t = ss(e);
            const n = [];
            for (const e of t.g())
              n.push({
                score: En(e, 2) ?? 0,
                index: _n(e, 1) ?? 0 ?? -1,
                categoryName: vn(e, 3) ?? "" ?? "",
                displayName: vn(e, 4) ?? "" ?? "",
              });
            i.push(n);
          }
          (r.call(n, ...i), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("handedness", (t) => {
          Yo(this, t);
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((_c.prototype.detectForVideo = _c.prototype.F),
    (_c.prototype.detect = _c.prototype.D),
    (_c.prototype.setOptions = _c.prototype.o),
    (_c.createFromModelPath = function (t, e) {
      return za(_c, t, { baseOptions: { modelAssetPath: e } });
    }),
    (_c.createFromModelBuffer = function (t, e) {
      return za(_c, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (_c.createFromOptions = function (t, e) {
      return za(_c, t, e);
    }),
    (_c.HAND_CONNECTIONS = dc));
  var vc = Va(
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 7],
    [0, 4],
    [4, 5],
    [5, 6],
    [6, 8],
    [9, 10],
    [11, 12],
    [11, 13],
    [13, 15],
    [15, 17],
    [15, 19],
    [15, 21],
    [17, 19],
    [12, 14],
    [14, 16],
    [16, 18],
    [16, 20],
    [16, 22],
    [18, 20],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [24, 26],
    [25, 27],
    [26, 28],
    [27, 29],
    [28, 30],
    [29, 31],
    [30, 32],
    [27, 31],
    [28, 32]
  );
  function Ec(t) {
    t.h = {
      faceLandmarks: [],
      faceBlendshapes: [],
      poseLandmarks: [],
      poseWorldLandmarks: [],
      poseSegmentationMasks: [],
      leftHandLandmarks: [],
      leftHandWorldLandmarks: [],
      rightHandLandmarks: [],
      rightHandWorldLandmarks: [],
    };
  }
  function wc(t) {
    try {
      if (!t.C) return t.h;
      t.C(t.h);
    } finally {
      Jo(t);
    }
  }
  function Tc(t, e) {
    ((t = fs(t)), e.push(Lo(t)));
  }
  var Ac = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "input_frames_image", null, false),
        (this.h = {
          faceLandmarks: [],
          faceBlendshapes: [],
          poseLandmarks: [],
          poseWorldLandmarks: [],
          poseSegmentationMasks: [],
          leftHandLandmarks: [],
          leftHandWorldLandmarks: [],
          rightHandLandmarks: [],
          rightHandWorldLandmarks: [],
        }),
        (this.outputPoseSegmentationMasks = this.outputFaceBlendshapes = false),
        dn((t = this.j = new ao()), 0, 1, (e = new Is())),
        (this.K = new $s()),
        dn(this.j, 0, 2, this.K),
        (this.Y = new io()),
        dn(this.j, 0, 3, this.Y),
        (this.s = new Cs()),
        dn(this.j, 0, 4, this.s),
        (this.H = new Ns()),
        dn(this.j, 0, 5, this.H),
        (this.v = new so()),
        dn(this.j, 0, 6, this.v),
        (this.L = new oo()),
        dn(this.j, 0, 7, this.L),
        An(this.s, 2, 0.5),
        An(this.s, 3, 0.3),
        An(this.H, 2, 0.5),
        An(this.v, 2, 0.5),
        An(this.v, 3, 0.3),
        An(this.L, 2, 0.5),
        An(this.K, 2, 0.5));
    }
    get baseOptions() {
      return hn(this.j, Is, 1);
    }
    set baseOptions(t) {
      dn(this.j, 0, 1, t);
    }
    o(t) {
      return (
        "minFaceDetectionConfidence" in t &&
          An(this.s, 2, t.minFaceDetectionConfidence ?? 0.5),
        "minFaceSuppressionThreshold" in t &&
          An(this.s, 3, t.minFaceSuppressionThreshold ?? 0.3),
        "minFacePresenceConfidence" in t &&
          An(this.H, 2, t.minFacePresenceConfidence ?? 0.5),
        "outputFaceBlendshapes" in t &&
          (this.outputFaceBlendshapes = !!t.outputFaceBlendshapes),
        "minPoseDetectionConfidence" in t &&
          An(this.v, 2, t.minPoseDetectionConfidence ?? 0.5),
        "minPoseSuppressionThreshold" in t &&
          An(this.v, 3, t.minPoseSuppressionThreshold ?? 0.3),
        "minPosePresenceConfidence" in t &&
          An(this.L, 2, t.minPosePresenceConfidence ?? 0.5),
        "outputPoseSegmentationMasks" in t &&
          (this.outputPoseSegmentationMasks = !!t.outputPoseSegmentationMasks),
        "minHandLandmarksConfidence" in t &&
          An(this.K, 2, t.minHandLandmarksConfidence ?? 0.5),
        this.l(t)
      );
    }
    D(t, e, n) {
      const r = "function" != typeof e ? e : {};
      return (
        (this.C = "function" == typeof e ? e : n),
        Ec(this),
        Ya(this, t, r),
        wc(this)
      );
    }
    F(t, e, n, r) {
      const i = "function" != typeof n ? n : {};
      return (
        (this.C = "function" == typeof n ? n : r),
        Ec(this),
        $a(this, t, i, e),
        wc(this)
      );
    }
    m() {
      var t = new Qi();
      (Ji(t, "input_frames_image"),
        Zi(t, "pose_landmarks"),
        Zi(t, "pose_world_landmarks"),
        Zi(t, "face_landmarks"),
        Zi(t, "left_hand_landmarks"),
        Zi(t, "left_hand_world_landmarks"),
        Zi(t, "right_hand_landmarks"),
        Zi(t, "right_hand_world_landmarks"));
      const e = new Gi(),
        n = new xi();
      (tn(
        n,
        1,
        de(
          "type.googleapis.com/mediapipe.tasks.vision.holistic_landmarker.proto.HolisticLandmarkerGraphOptions"
        ),
        ""
      ),
        (function (t, e) {
          if (null != e)
            if (Array.isArray(e)) He(t, 2, Pe(e, Oe, void 0, void 0, false));
            else {
              if (!("string" == typeof e || e instanceof N || C(e)))
                throw Error(
                  "invalid value in Any.value field: " +
                    e +
                    " expected a ByteString, a base64 encoded string, a Uint8Array or a jspb array"
                );
              tn(t, 2, dt(e, false), U());
            }
        })(n, this.j.g()));
      const r = new zi();
      (Xi(
        r,
        "mediapipe.tasks.vision.holistic_landmarker.HolisticLandmarkerGraph"
      ),
        yn(r, 8, xi, n),
        Hi(r, "IMAGE:input_frames_image"),
        Wi(r, "POSE_LANDMARKS:pose_landmarks"),
        Wi(r, "POSE_WORLD_LANDMARKS:pose_world_landmarks"),
        Wi(r, "FACE_LANDMARKS:face_landmarks"),
        Wi(r, "LEFT_HAND_LANDMARKS:left_hand_landmarks"),
        Wi(r, "LEFT_HAND_WORLD_LANDMARKS:left_hand_world_landmarks"),
        Wi(r, "RIGHT_HAND_LANDMARKS:right_hand_landmarks"),
        Wi(r, "RIGHT_HAND_WORLD_LANDMARKS:right_hand_world_landmarks"),
        r.o(e),
        qi(t, r),
        $o(this, t),
        this.g.attachProtoListener("pose_landmarks", (t, e) => {
          (Tc(t, this.h.poseLandmarks), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("pose_landmarks", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoListener("pose_world_landmarks", (t, e) => {
          var n = this.h.poseWorldLandmarks;
          ((t = ls(t)), n.push(Ro(t)), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("pose_world_landmarks", (t) => {
          Yo(this, t);
        }),
        this.outputPoseSegmentationMasks &&
          (Wi(r, "POSE_SEGMENTATION_MASK:pose_segmentation_mask"),
          qo(this, "pose_segmentation_mask"),
          this.g.V("pose_segmentation_mask", (t, e) => {
            ((this.h.poseSegmentationMasks = [qa(this, t, true, !this.C)]),
              Yo(this, e));
          }),
          this.g.attachEmptyPacketListener("pose_segmentation_mask", (t) => {
            ((this.h.poseSegmentationMasks = []), Yo(this, t));
          })),
        this.g.attachProtoListener("face_landmarks", (t, e) => {
          (Tc(t, this.h.faceLandmarks), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("face_landmarks", (t) => {
          Yo(this, t);
        }),
        this.outputFaceBlendshapes &&
          (Zi(t, "extra_blendshapes"),
          Wi(r, "FACE_BLENDSHAPES:extra_blendshapes"),
          this.g.attachProtoListener("extra_blendshapes", (t, e) => {
            var n = this.h.faceBlendshapes;
            (this.outputFaceBlendshapes &&
              ((t = ss(t)), n.push(So(t.g() ?? []))),
              Yo(this, e));
          }),
          this.g.attachEmptyPacketListener("extra_blendshapes", (t) => {
            Yo(this, t);
          })),
        this.g.attachProtoListener("left_hand_landmarks", (t, e) => {
          (Tc(t, this.h.leftHandLandmarks), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("left_hand_landmarks", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoListener("left_hand_world_landmarks", (t, e) => {
          var n = this.h.leftHandWorldLandmarks;
          ((t = ls(t)), n.push(Ro(t)), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("left_hand_world_landmarks", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoListener("right_hand_landmarks", (t, e) => {
          (Tc(t, this.h.rightHandLandmarks), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("right_hand_landmarks", (t) => {
          Yo(this, t);
        }),
        this.g.attachProtoListener("right_hand_world_landmarks", (t, e) => {
          var n = this.h.rightHandWorldLandmarks;
          ((t = ls(t)), n.push(Ro(t)), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("right_hand_world_landmarks", (t) => {
          Yo(this, t);
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((Ac.prototype.detectForVideo = Ac.prototype.F),
    (Ac.prototype.detect = Ac.prototype.D),
    (Ac.prototype.setOptions = Ac.prototype.o),
    (Ac.createFromModelPath = function (t, e) {
      return za(Ac, t, { baseOptions: { modelAssetPath: e } });
    }),
    (Ac.createFromModelBuffer = function (t, e) {
      return za(Ac, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (Ac.createFromOptions = function (t, e) {
      return za(Ac, t, e);
    }),
    (Ac.HAND_CONNECTIONS = dc),
    (Ac.POSE_CONNECTIONS = vc),
    (Ac.FACE_LANDMARKS_LIPS = Qa),
    (Ac.FACE_LANDMARKS_LEFT_EYE = tc),
    (Ac.FACE_LANDMARKS_LEFT_EYEBROW = ec),
    (Ac.FACE_LANDMARKS_LEFT_IRIS = nc),
    (Ac.FACE_LANDMARKS_RIGHT_EYE = rc),
    (Ac.FACE_LANDMARKS_RIGHT_EYEBROW = ic),
    (Ac.FACE_LANDMARKS_RIGHT_IRIS = sc),
    (Ac.FACE_LANDMARKS_FACE_OVAL = oc),
    (Ac.FACE_LANDMARKS_CONTOURS = ac),
    (Ac.FACE_LANDMARKS_TESSELATION = cc));
  var bc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "input_image", "norm_rect", true),
        (this.j = { classifications: [] }),
        dn((t = this.h = new uo()), 0, 1, (e = new Is())));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      return (dn(this.h, 0, 2, ko(t, hn(this.h, bs, 2))), this.l(t));
    }
    qa(t, e) {
      return ((this.j = { classifications: [] }), Ya(this, t, e), this.j);
    }
    ra(t, e, n) {
      return ((this.j = { classifications: [] }), $a(this, t, n, e), this.j);
    }
    m() {
      var t = new Qi();
      (Ji(t, "input_image"), Ji(t, "norm_rect"), Zi(t, "classifications"));
      const e = new Gi();
      Yn(e, lo, this.h);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.image_classifier.ImageClassifierGraph"),
        Hi(n, "IMAGE:input_image"),
        Hi(n, "NORM_RECT:norm_rect"),
        Wi(n, "CLASSIFICATIONS:classifications"),
        n.o(e),
        qi(t, n),
        this.g.attachProtoListener("classifications", (t, e) => {
          ((this.j = (function (t) {
            const e = {
              classifications: ln(t, ys, 1).map((t) =>
                So(hn(t, rs, 4)?.g() ?? [], _n(t, 2) ?? 0, vn(t, 3) ?? "")
              ),
            };
            return (
              null != he(Ve(t, 2)) && (e.timestampMs = he(Ve(t, 2)) ?? 0),
              e
            );
          })(_s(t))),
            Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("classifications", (t) => {
          Yo(this, t);
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((bc.prototype.classifyForVideo = bc.prototype.ra),
    (bc.prototype.classify = bc.prototype.qa),
    (bc.prototype.setOptions = bc.prototype.o),
    (bc.createFromModelPath = function (t, e) {
      return za(bc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (bc.createFromModelBuffer = function (t, e) {
      return za(bc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (bc.createFromOptions = function (t, e) {
      return za(bc, t, e);
    }));
  var kc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect", true),
        (this.h = new fo()),
        (this.embeddings = { embeddings: [] }),
        dn((t = this.h), 0, 1, (e = new Is())));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      var e = this.h,
        n = hn(this.h, Ss, 2);
      return (
        (n = n ? n.clone() : new Ss()),
        void 0 !== t.l2Normalize
          ? wn(n, 1, t.l2Normalize)
          : "l2Normalize" in t && He(n, 1),
        void 0 !== t.quantize
          ? wn(n, 2, t.quantize)
          : "quantize" in t && He(n, 2),
        dn(e, 0, 2, n),
        this.l(t)
      );
    }
    xa(t, e) {
      return (Ya(this, t, e), this.embeddings);
    }
    ya(t, e, n) {
      return ($a(this, t, n, e), this.embeddings);
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"), Ji(t, "norm_rect"), Zi(t, "embeddings_out"));
      const e = new Gi();
      Yn(e, po, this.h);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.image_embedder.ImageEmbedderGraph"),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "NORM_RECT:norm_rect"),
        Wi(n, "EMBEDDINGS:embeddings_out"),
        n.o(e),
        qi(t, n),
        this.g.attachProtoListener("embeddings_out", (t, e) => {
          ((t = As(t)),
            (this.embeddings = (function (t) {
              return {
                embeddings: ln(t, ws, 1).map((t) => {
                  const e = {
                    headIndex: _n(t, 3) ?? 0 ?? -1,
                    headName: vn(t, 4) ?? "" ?? "",
                  };
                  if (void 0 !== cn(t, vs, nn(t, 1)))
                    ((t = $e((t = hn(t, vs, nn(t, 1))), 1, qt, Ye())),
                      (e.floatEmbedding = t.slice()));
                  else {
                    const n = new Uint8Array(0);
                    e.quantizedEmbedding = hn(t, Es, nn(t, 2))?.ma()?.h() ?? n;
                  }
                  return e;
                }),
                timestampMs: he(Ve(t, 2)) ?? 0,
              };
            })(t)),
            Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("embeddings_out", (t) => {
          Yo(this, t);
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((kc.cosineSimilarity = function (t, e) {
    if (t.floatEmbedding && e.floatEmbedding)
      t = Io(t.floatEmbedding, e.floatEmbedding);
    else {
      if (!t.quantizedEmbedding || !e.quantizedEmbedding)
        throw Error(
          "Cannot compute cosine similarity between quantized and float embeddings."
        );
      t = Io(Fo(t.quantizedEmbedding), Fo(e.quantizedEmbedding));
    }
    return t;
  }),
    (kc.prototype.embedForVideo = kc.prototype.ya),
    (kc.prototype.embed = kc.prototype.xa),
    (kc.prototype.setOptions = kc.prototype.o),
    (kc.createFromModelPath = function (t, e) {
      return za(kc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (kc.createFromModelBuffer = function (t, e) {
      return za(kc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (kc.createFromOptions = function (t, e) {
      return za(kc, t, e);
    }));
  var Sc = class {
    constructor(t, e, n) {
      ((this.confidenceMasks = t),
        (this.categoryMask = e),
        (this.qualityScores = n));
    }
    close() {
      (this.confidenceMasks?.forEach((t) => {
        t.close();
      }),
        this.categoryMask?.close());
    }
  };
  function xc(t) {
    ((t.categoryMask = void 0),
      (t.confidenceMasks = void 0),
      (t.qualityScores = void 0));
  }
  function Lc(t) {
    try {
      const e = new Sc(t.confidenceMasks, t.categoryMask, t.qualityScores);
      if (!t.j) return e;
      t.j(e);
    } finally {
      Jo(t);
    }
  }
  Sc.prototype.close = Sc.prototype.close;
  var Rc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect", false),
        (this.s = []),
        (this.outputCategoryMask = false),
        (this.outputConfidenceMasks = true),
        (this.h = new vo()),
        (this.v = new go()),
        dn(this.h, 0, 3, this.v),
        dn((t = this.h), 0, 1, (e = new Is())));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      return (
        void 0 !== t.displayNamesLocale
          ? He(this.h, 2, de(t.displayNamesLocale))
          : "displayNamesLocale" in t && He(this.h, 2),
        "outputCategoryMask" in t &&
          (this.outputCategoryMask = t.outputCategoryMask ?? false),
        "outputConfidenceMasks" in t &&
          (this.outputConfidenceMasks = t.outputConfidenceMasks ?? true),
        super.l(t)
      );
    }
    J() {
      !(function (t) {
        const e = ln(t.ca(), zi, 1).filter((t) =>
          (vn(t, 1) ?? "").includes(
            "mediapipe.tasks.TensorsToSegmentationCalculator"
          )
        );
        if (((t.s = []), e.length > 1))
          throw Error(
            "The graph has more than one mediapipe.tasks.TensorsToSegmentationCalculator."
          );
        1 === e.length &&
          (hn(e[0], Gi, 7)?.l()?.g() ?? new Map()).forEach((e, n) => {
            t.s[Number(n)] = vn(e, 1) ?? "";
          });
      })(this);
    }
    segment(t, e, n) {
      const r = "function" != typeof e ? e : {};
      return (
        (this.j = "function" == typeof e ? e : n),
        xc(this),
        Ya(this, t, r),
        Lc(this)
      );
    }
    Ia(t, e, n, r) {
      const i = "function" != typeof n ? n : {};
      return (
        (this.j = "function" == typeof n ? n : r),
        xc(this),
        $a(this, t, i, e),
        Lc(this)
      );
    }
    Ba() {
      return this.s;
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"), Ji(t, "norm_rect"));
      const e = new Gi();
      Yn(e, Eo, this.h);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.image_segmenter.ImageSegmenterGraph"),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "NORM_RECT:norm_rect"),
        n.o(e),
        qi(t, n),
        $o(this, t),
        this.outputConfidenceMasks &&
          (Zi(t, "confidence_masks"),
          Wi(n, "CONFIDENCE_MASKS:confidence_masks"),
          qo(this, "confidence_masks"),
          this.g.ba("confidence_masks", (t, e) => {
            ((this.confidenceMasks = t.map((t) => qa(this, t, true, !this.j))),
              Yo(this, e));
          }),
          this.g.attachEmptyPacketListener("confidence_masks", (t) => {
            ((this.confidenceMasks = []), Yo(this, t));
          })),
        this.outputCategoryMask &&
          (Zi(t, "category_mask"),
          Wi(n, "CATEGORY_MASK:category_mask"),
          qo(this, "category_mask"),
          this.g.V("category_mask", (t, e) => {
            ((this.categoryMask = qa(this, t, false, !this.j)), Yo(this, e));
          }),
          this.g.attachEmptyPacketListener("category_mask", (t) => {
            ((this.categoryMask = void 0), Yo(this, t));
          })),
        Zi(t, "quality_scores"),
        Wi(n, "QUALITY_SCORES:quality_scores"),
        this.g.attachFloatVectorListener("quality_scores", (t, e) => {
          ((this.qualityScores = t), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("quality_scores", (t) => {
          ((this.categoryMask = void 0), Yo(this, t));
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((Rc.prototype.getLabels = Rc.prototype.Ba),
    (Rc.prototype.segmentForVideo = Rc.prototype.Ia),
    (Rc.prototype.segment = Rc.prototype.segment),
    (Rc.prototype.setOptions = Rc.prototype.o),
    (Rc.createFromModelPath = function (t, e) {
      return za(Rc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (Rc.createFromModelBuffer = function (t, e) {
      return za(Rc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (Rc.createFromOptions = function (t, e) {
      return za(Rc, t, e);
    }));
  var Fc = class {
    constructor(t, e, n) {
      ((this.confidenceMasks = t),
        (this.categoryMask = e),
        (this.qualityScores = n));
    }
    close() {
      (this.confidenceMasks?.forEach((t) => {
        t.close();
      }),
        this.categoryMask?.close());
    }
  };
  Fc.prototype.close = Fc.prototype.close;
  var Ic = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Mc = [0, hi, -2],
    Pc = [0, ni, -3, di, ni, -1],
    Cc = [0, Pc],
    Oc = [0, Pc, hi, -1],
    Uc = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Dc = [0, ni, -1, di],
    Nc = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Bc = class extends $n {
      constructor(t) {
        super(t);
      }
    },
    Gc = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15],
    jc = class extends $n {
      constructor(t) {
        super(t);
      }
    };
  jc.prototype.g = Si([
    0,
    yi,
    [
      0,
      Gc,
      _i,
      Pc,
      _i,
      [0, Pc, Mc],
      _i,
      Cc,
      _i,
      [0, Cc, Mc],
      _i,
      Dc,
      _i,
      [0, ni, -3, di, Ti],
      _i,
      [0, ni, -3, di],
      _i,
      [0, mi, ni, -2, di, hi, di, -1, 2, ni, Mc],
      _i,
      Oc,
      _i,
      [0, Oc, Mc],
      ni,
      Mc,
      mi,
      _i,
      [0, ni, -3, di, Mc, -1],
      _i,
      [0, yi, Dc],
    ],
    mi,
    [0, mi, hi, -1, di],
  ]);
  var Vc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect_in", false),
        (this.outputCategoryMask = false),
        (this.outputConfidenceMasks = true),
        (this.h = new vo()),
        (this.s = new go()),
        dn(this.h, 0, 3, this.s),
        dn((t = this.h), 0, 1, (e = new Is())));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      return (
        "outputCategoryMask" in t &&
          (this.outputCategoryMask = t.outputCategoryMask ?? false),
        "outputConfidenceMasks" in t &&
          (this.outputConfidenceMasks = t.outputConfidenceMasks ?? true),
        super.l(t)
      );
    }
    segment(t, e, n, r) {
      const i = "function" != typeof n ? n : {};
      ((this.j = "function" == typeof n ? n : r),
        (this.qualityScores =
          this.categoryMask =
          this.confidenceMasks =
            void 0),
        (n = this.B + 1),
        (r = new jc()));
      const s = new Bc();
      var o = new Ic();
      if ((Tn(o, 1, 255), dn(s, 0, 12, o), e.keypoint && e.scribble))
        throw Error("Cannot provide both keypoint and scribble.");
      if (e.keypoint) {
        var a = new Uc();
        (wn(a, 3, true),
          An(a, 1, e.keypoint.x),
          An(a, 2, e.keypoint.y),
          fn(s, 5, Gc, a));
      } else {
        if (!e.scribble)
          throw Error("Must provide either a keypoint or a scribble.");
        for (a of ((o = new Nc()), e.scribble))
          (wn((e = new Uc()), 3, true),
            An(e, 1, a.x),
            An(e, 2, a.y),
            yn(o, 1, Uc, e));
        fn(s, 15, Gc, o);
      }
      (yn(r, 1, Bc, s),
        this.g.addProtoToStream(r.g(), "drishti.RenderData", "roi_in", n),
        Ya(this, t, i));
      t: {
        try {
          const t = new Fc(
            this.confidenceMasks,
            this.categoryMask,
            this.qualityScores
          );
          if (!this.j) {
            var c = t;
            break t;
          }
          this.j(t);
        } finally {
          Jo(this);
        }
        c = void 0;
      }
      return c;
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"), Ji(t, "roi_in"), Ji(t, "norm_rect_in"));
      const e = new Gi();
      Yn(e, Eo, this.h);
      const n = new zi();
      (Xi(
        n,
        "mediapipe.tasks.vision.interactive_segmenter.InteractiveSegmenterGraph"
      ),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "ROI:roi_in"),
        Hi(n, "NORM_RECT:norm_rect_in"),
        n.o(e),
        qi(t, n),
        $o(this, t),
        this.outputConfidenceMasks &&
          (Zi(t, "confidence_masks"),
          Wi(n, "CONFIDENCE_MASKS:confidence_masks"),
          qo(this, "confidence_masks"),
          this.g.ba("confidence_masks", (t, e) => {
            ((this.confidenceMasks = t.map((t) => qa(this, t, true, !this.j))),
              Yo(this, e));
          }),
          this.g.attachEmptyPacketListener("confidence_masks", (t) => {
            ((this.confidenceMasks = []), Yo(this, t));
          })),
        this.outputCategoryMask &&
          (Zi(t, "category_mask"),
          Wi(n, "CATEGORY_MASK:category_mask"),
          qo(this, "category_mask"),
          this.g.V("category_mask", (t, e) => {
            ((this.categoryMask = qa(this, t, false, !this.j)), Yo(this, e));
          }),
          this.g.attachEmptyPacketListener("category_mask", (t) => {
            ((this.categoryMask = void 0), Yo(this, t));
          })),
        Zi(t, "quality_scores"),
        Wi(n, "QUALITY_SCORES:quality_scores"),
        this.g.attachFloatVectorListener("quality_scores", (t, e) => {
          ((this.qualityScores = t), Yo(this, e));
        }),
        this.g.attachEmptyPacketListener("quality_scores", (t) => {
          ((this.categoryMask = void 0), Yo(this, t));
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((Vc.prototype.segment = Vc.prototype.segment),
    (Vc.prototype.setOptions = Vc.prototype.o),
    (Vc.createFromModelPath = function (t, e) {
      return za(Vc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (Vc.createFromModelBuffer = function (t, e) {
      return za(Vc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (Vc.createFromOptions = function (t, e) {
      return za(Vc, t, e);
    }));
  var Xc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "input_frame_gpu", "norm_rect", false),
        (this.j = { detections: [] }),
        dn((t = this.h = new wo()), 0, 1, (e = new Is())));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      return (
        void 0 !== t.displayNamesLocale
          ? He(this.h, 2, de(t.displayNamesLocale))
          : "displayNamesLocale" in t && He(this.h, 2),
        void 0 !== t.maxResults
          ? Tn(this.h, 3, t.maxResults)
          : "maxResults" in t && He(this.h, 3),
        void 0 !== t.scoreThreshold
          ? An(this.h, 4, t.scoreThreshold)
          : "scoreThreshold" in t && He(this.h, 4),
        void 0 !== t.categoryAllowlist
          ? bn(this.h, 5, t.categoryAllowlist)
          : "categoryAllowlist" in t && He(this.h, 5),
        void 0 !== t.categoryDenylist
          ? bn(this.h, 6, t.categoryDenylist)
          : "categoryDenylist" in t && He(this.h, 6),
        this.l(t)
      );
    }
    D(t, e) {
      return ((this.j = { detections: [] }), Ya(this, t, e), this.j);
    }
    F(t, e, n) {
      return ((this.j = { detections: [] }), $a(this, t, n, e), this.j);
    }
    m() {
      var t = new Qi();
      (Ji(t, "input_frame_gpu"), Ji(t, "norm_rect"), Zi(t, "detections"));
      const e = new Gi();
      Yn(e, To, this.h);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.ObjectDetectorGraph"),
        Hi(n, "IMAGE:input_frame_gpu"),
        Hi(n, "NORM_RECT:norm_rect"),
        Wi(n, "DETECTIONS:detections"),
        n.o(e),
        qi(t, n),
        this.g.attachProtoVectorListener("detections", (t, e) => {
          for (const e of t) ((t = hs(e)), this.j.detections.push(xo(t)));
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("detections", (t) => {
          Yo(this, t);
        }),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((Xc.prototype.detectForVideo = Xc.prototype.F),
    (Xc.prototype.detect = Xc.prototype.D),
    (Xc.prototype.setOptions = Xc.prototype.o),
    (Xc.createFromModelPath = async function (t, e) {
      return za(Xc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (Xc.createFromModelBuffer = function (t, e) {
      return za(Xc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (Xc.createFromOptions = function (t, e) {
      return za(Xc, t, e);
    }));
  var Hc = class {
    constructor(t, e, n) {
      ((this.landmarks = t),
        (this.worldLandmarks = e),
        (this.segmentationMasks = n));
    }
    close() {
      this.segmentationMasks?.forEach((t) => {
        t.close();
      });
    }
  };
  function Wc(t) {
    ((t.landmarks = []),
      (t.worldLandmarks = []),
      (t.segmentationMasks = void 0));
  }
  function zc(t) {
    try {
      const e = new Hc(t.landmarks, t.worldLandmarks, t.segmentationMasks);
      if (!t.s) return e;
      t.s(e);
    } finally {
      Jo(t);
    }
  }
  Hc.prototype.close = Hc.prototype.close;
  var Kc = class extends Ja {
    constructor(t, e) {
      (super(new Wa(t, e), "image_in", "norm_rect", false),
        (this.landmarks = []),
        (this.worldLandmarks = []),
        (this.outputSegmentationMasks = false),
        dn((t = this.h = new Ao()), 0, 1, (e = new Is())),
        (this.v = new oo()),
        dn(this.h, 0, 3, this.v),
        (this.j = new so()),
        dn(this.h, 0, 2, this.j),
        Tn(this.j, 4, 1),
        An(this.j, 2, 0.5),
        An(this.v, 2, 0.5),
        An(this.h, 4, 0.5));
    }
    get baseOptions() {
      return hn(this.h, Is, 1);
    }
    set baseOptions(t) {
      dn(this.h, 0, 1, t);
    }
    o(t) {
      return (
        "numPoses" in t && Tn(this.j, 4, t.numPoses ?? 1),
        "minPoseDetectionConfidence" in t &&
          An(this.j, 2, t.minPoseDetectionConfidence ?? 0.5),
        "minTrackingConfidence" in t &&
          An(this.h, 4, t.minTrackingConfidence ?? 0.5),
        "minPosePresenceConfidence" in t &&
          An(this.v, 2, t.minPosePresenceConfidence ?? 0.5),
        "outputSegmentationMasks" in t &&
          (this.outputSegmentationMasks = t.outputSegmentationMasks ?? false),
        this.l(t)
      );
    }
    D(t, e, n) {
      const r = "function" != typeof e ? e : {};
      return (
        (this.s = "function" == typeof e ? e : n),
        Wc(this),
        Ya(this, t, r),
        zc(this)
      );
    }
    F(t, e, n, r) {
      const i = "function" != typeof n ? n : {};
      return (
        (this.s = "function" == typeof n ? n : r),
        Wc(this),
        $a(this, t, i, e),
        zc(this)
      );
    }
    m() {
      var t = new Qi();
      (Ji(t, "image_in"),
        Ji(t, "norm_rect"),
        Zi(t, "normalized_landmarks"),
        Zi(t, "world_landmarks"),
        Zi(t, "segmentation_masks"));
      const e = new Gi();
      Yn(e, bo, this.h);
      const n = new zi();
      (Xi(n, "mediapipe.tasks.vision.pose_landmarker.PoseLandmarkerGraph"),
        Hi(n, "IMAGE:image_in"),
        Hi(n, "NORM_RECT:norm_rect"),
        Wi(n, "NORM_LANDMARKS:normalized_landmarks"),
        Wi(n, "WORLD_LANDMARKS:world_landmarks"),
        n.o(e),
        qi(t, n),
        $o(this, t),
        this.g.attachProtoVectorListener("normalized_landmarks", (t, e) => {
          this.landmarks = [];
          for (const e of t) ((t = fs(e)), this.landmarks.push(Lo(t)));
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("normalized_landmarks", (t) => {
          ((this.landmarks = []), Yo(this, t));
        }),
        this.g.attachProtoVectorListener("world_landmarks", (t, e) => {
          this.worldLandmarks = [];
          for (const e of t) ((t = ls(e)), this.worldLandmarks.push(Ro(t)));
          Yo(this, e);
        }),
        this.g.attachEmptyPacketListener("world_landmarks", (t) => {
          ((this.worldLandmarks = []), Yo(this, t));
        }),
        this.outputSegmentationMasks &&
          (Wi(n, "SEGMENTATION_MASK:segmentation_masks"),
          qo(this, "segmentation_masks"),
          this.g.ba("segmentation_masks", (t, e) => {
            ((this.segmentationMasks = t.map((t) =>
              qa(this, t, true, !this.s)
            )),
              Yo(this, e));
          }),
          this.g.attachEmptyPacketListener("segmentation_masks", (t) => {
            ((this.segmentationMasks = []), Yo(this, t));
          })),
        (t = t.g()),
        this.setGraph(new Uint8Array(t), true));
    }
  };
  ((Kc.prototype.detectForVideo = Kc.prototype.F),
    (Kc.prototype.detect = Kc.prototype.D),
    (Kc.prototype.setOptions = Kc.prototype.o),
    (Kc.createFromModelPath = function (t, e) {
      return za(Kc, t, { baseOptions: { modelAssetPath: e } });
    }),
    (Kc.createFromModelBuffer = function (t, e) {
      return za(Kc, t, { baseOptions: { modelAssetBuffer: e } });
    }),
    (Kc.createFromOptions = function (t, e) {
      return za(Kc, t, e);
    }),
    (Kc.POSE_CONNECTIONS = vc));

  // Servicio usando la API moderna de MediaPipe (tasks-vision) - IMPLEMENTACIÓN DEL PROYECTO DE REFERENCIA
  class MediaPipeRealService {
    constructor() {
      this.initialized = false;
      this.faceLandmarker = null;
      this.lastLandmarks = [];
      this.drawingUtils = null;
    }
    async initialize() {
      if (this.initialized) return;
      try {
        console.log(
          "🚀 Inicializando MediaPipe Real Service (proyecto de referencia)..."
        );
        // Carga los modelos y crea el detector - EXACTAMENTE como el proyecto de referencia
        const filesetResolver = await Uo.forVisionTasks(
          // Usa CDN oficial de MediaPipe para los modelos (como el proyecto de referencia)
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        this.faceLandmarker = await uc.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", // Modelo oficial desde CDN
          },
          runningMode: "VIDEO",
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          numFaces: 1,
        });
        // DrawingUtils requiere un contexto WebGL2, lo crearemos cuando sea necesario
        this.drawingUtils = null;
        this.initialized = true;
        console.log(
          "✅ MediaPipe Real Service inicializado correctamente (proyecto de referencia)"
        );
      } catch (error) {
        console.error("❌ Error inicializando MediaPipe Real Service:", error);
        throw error;
      }
    }
    async detectFaces(video) {
      if (!this.initialized || !this.faceLandmarker) {
        console.warn("⚠️ MediaPipe no está inicializado");
        return [];
      }
      try {
        // Procesa el frame actual del video - EXACTAMENTE como el proyecto de referencia
        const faces = this.faceLandmarker.detectForVideo(
          video,
          performance.now()
        );
        this.lastLandmarks = faces.faceLandmarks || [];
        if (this.lastLandmarks.length > 0) {
          console.log(
            `🎯 MediaPipe detectó ${this.lastLandmarks.length} rostros con ${this.lastLandmarks[0]?.length || 0} landmarks`
          );
        }
        // Devuelve los landmarks del primer rostro (array de 478 puntos)
        return this.lastLandmarks[0] || [];
      } catch (error) {
        console.error("❌ Error detectando rostros:", error);
        return [];
      }
    }
    getLastLandmarks() {
      return this.lastLandmarks;
    }
    isInitialized() {
      return this.initialized;
    }
    // Método para dibujar malla facial simplificado (evitando errores de TypeScript)
    drawFacialMesh(canvas, landmarks) {
      console.log(
        "🎨 drawFacialMesh llamado con:",
        landmarks.length,
        "landmarks"
      );
      if (!landmarks || landmarks.length === 0) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Limpiar canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Dibujar landmarks como puntos simples
      if (landmarks.length >= 468) {
        // Dibujar contorno facial (puntos 0-16)
        ctx.strokeStyle = "#E0E0E0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          if (landmarks[i] && "x" in landmarks[i] && "y" in landmarks[i]) {
            const x = landmarks[i].x * canvas.width;
            const y = landmarks[i].y * canvas.height;
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
        // Dibujar ojos
        ctx.strokeStyle = "#FF3030";
        ctx.beginPath();
        // Ojo izquierdo (puntos 33-42)
        for (let i = 33; i <= 42; i++) {
          if (landmarks[i] && "x" in landmarks[i] && "y" in landmarks[i]) {
            const x = landmarks[i].x * canvas.width;
            const y = landmarks[i].y * canvas.height;
            if (i === 33) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
        // Ojo derecho (puntos 362-383)
        ctx.strokeStyle = "#30FF30";
        ctx.beginPath();
        for (let i = 362; i <= 383; i++) {
          if (landmarks[i] && "x" in landmarks[i] && "y" in landmarks[i]) {
            const x = landmarks[i].x * canvas.width;
            const y = landmarks[i].y * canvas.height;
            if (i === 362) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
        // Dibujar TODOS los landmarks como puntos pequeños
        ctx.fillStyle = "#FF0000";
        for (let i = 0; i < landmarks.length; i++) {
          if (landmarks[i] && "x" in landmarks[i] && "y" in landmarks[i]) {
            const x = landmarks[i].x * canvas.width;
            const y = landmarks[i].y * canvas.height;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
        // Información en pantalla
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 14px Arial";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;
        const info = [
          "⚙️ MEDIAPIPE REAL",
          `✅ ${landmarks.length} landmarks`,
          "👤 MALLA FACIAL REAL",
        ];
        info.forEach((text, index) => {
          const y = 25 + index * 25;
          ctx.strokeText(text, 15, y);
          ctx.fillText(text, 15, y);
        });
      }
    }
    // Método para calcular EAR (Eye Aspect Ratio) como el proyecto de referencia
    calculateEAR(landmarks) {
      if (!landmarks || landmarks.length === 0) return 0;
      const eye = landmarks[0];
      // Puntos del ojo izquierdo (como el proyecto de referencia)
      const p1 = eye[33]; // Punto superior del ojo
      const p2 = eye[7]; // Punto inferior del ojo
      const p3 = eye[163]; // Punto izquierdo del ojo
      const p4 = eye[144]; // Punto derecho del ojo
      const p5 = eye[145]; // Punto superior izquierdo
      const p6 = eye[153]; // Punto superior derecho
      // Calcular EAR usando la fórmula del proyecto de referencia
      const A = this.distance(p2, p6);
      const B = this.distance(p3, p5);
      const C = this.distance(p1, p4);
      const ear = (A + B) / (2.0 * C);
      return ear;
    }
    // Método para calcular sonrisa como el proyecto de referencia
    calculateSmile(landmarks) {
      if (!landmarks || landmarks.length === 0) return 0;
      const face = landmarks[0];
      // Puntos de la boca (como el proyecto de referencia)
      const upperLip = face[13]; // Labio superior
      const lowerLip = face[14]; // Labio inferior
      const leftCorner = face[61]; // Esquina izquierda
      const rightCorner = face[291]; // Esquina derecha
      // Calcular ratio de sonrisa
      const mouthHeight = this.distance(upperLip, lowerLip);
      const mouthWidth = this.distance(leftCorner, rightCorner);
      const smileRatio = mouthWidth / mouthHeight;
      return Math.min(smileRatio / 3.0, 1.0); // Normalizar a 0-1
    }
    // Método para detectar movimiento de cabeza como el proyecto de referencia
    calculateHeadRotation(landmarks) {
      if (!landmarks || landmarks.length === 0) {
        return { x: 0, y: 0, z: 0 };
      }
      const face = landmarks[0];
      // Puntos de referencia para rotación (como el proyecto de referencia)
      const nose = face[1];
      const leftEye = face[33];
      const rightEye = face[263];
      face[234];
      face[454];
      // Calcular rotación en X (arriba/abajo)
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      const noseY = nose.y;
      const rotationX = (noseY - eyeCenterY) * 180; // Convertir a grados
      // Calcular rotación en Y (izquierda/derecha)
      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const noseX = nose.x;
      const rotationY = (noseX - eyeCenterX) * 180; // Convertir a grados
      // Calcular rotación en Z (inclinación)
      const leftEyeX = leftEye.x;
      rightEye.x;
      const rotationZ =
        (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEyeX) * 180) /
        Math.PI;
      return {
        x: rotationX,
        y: rotationY,
        z: rotationZ,
      };
    }
    // Helper para calcular distancia entre puntos
    distance(p1, p2) {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    // Método para limpiar recursos
    dispose() {
      this.faceLandmarker = null;
      this.drawingUtils = null;
      this.initialized = false;
      this.lastLandmarks = [];
    }
  }

  class EyeAspectRatioCalculator {
    static calculate(
      landmarks,
      thresholds = EyeAspectRatioCalculator.DEFAULT_THRESHOLDS
    ) {
      if (!landmarks || landmarks.length < 400) {
        return {
          phase: "open",
          ear: 1,
          thresholds,
          isBlinking: false,
          confidence: 0,
          naturalness: 0,
          debug: { reason: "Insufficient landmarks" },
        };
      }
      const leftEAR = this.calculateSingleEyeEAR(
        landmarks,
        this.LEFT_EYE_INDICES
      );
      const rightEAR = this.calculateSingleEyeEAR(
        landmarks,
        this.RIGHT_EYE_INDICES
      );
      const average = (leftEAR + rightEAR) / 2;
      // State machine phase
      let phase = "open";
      if (average < thresholds.CLOSED) phase = "closed";
      else if (average < thresholds.BLINK) phase = "closing";
      else if (average < thresholds.OPEN) phase = "opening";
      // Confidence and naturalness (simple, can be improved)
      const confidence = Math.max(0, 1 - Math.abs(leftEAR - rightEAR));
      const naturalness = Math.max(0, 1 - Math.abs(leftEAR - rightEAR) * 2);
      return {
        phase,
        ear: average,
        thresholds,
        isBlinking: phase === "closing" || phase === "closed",
        confidence,
        naturalness,
        debug: {
          leftEAR,
          rightEAR,
          average,
          phase,
          thresholds,
          confidence,
          naturalness,
        },
      };
    }
    static calculateSingleEyeEAR(landmarks, eyeIndices) {
      if (landmarks.length < Math.max(...eyeIndices) + 1) {
        return 0;
      }
      try {
        const eyePoints = eyeIndices.map((index) => landmarks[index]);
        const p1 = eyePoints[0];
        const p2 = eyePoints[1];
        const p3 = eyePoints[2];
        const p4 = eyePoints[3];
        const p5 = eyePoints[4];
        const p6 = eyePoints[5];
        const verticalDist1 = this.euclideanDistance(p2, p6);
        const verticalDist2 = this.euclideanDistance(p3, p5);
        const horizontalDist = this.euclideanDistance(p1, p4);
        if (horizontalDist === 0) return 0;
        return (verticalDist1 + verticalDist2) / (2.0 * horizontalDist);
      } catch (error) {
        return 0;
      }
    }
    static euclideanDistance(p1, p2) {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    // Automatic calibration (optional)
    static calibrate(history) {
      const openEAR = Math.max(...history);
      const closedEAR = Math.min(...history);
      const thresholds = {
        OPEN: openEAR,
        CLOSED: closedEAR,
        BLINK: (openEAR + closedEAR) / 2,
      };
      return { openEAR, closedEAR, thresholds };
    }
  }
  // Correct indices for MediaPipe 478 landmarks
  EyeAspectRatioCalculator.LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380];
  EyeAspectRatioCalculator.RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
  // Calibrated thresholds (can be adaptive)
  EyeAspectRatioCalculator.DEFAULT_THRESHOLDS = {
    OPEN: 0.25,
    CLOSED: 0.15,
    BLINK: 0.2,
  };

  class BlinkDetector {
    constructor() {
      this.earHistory = [];
      this.lastBlinkTime = 0;
      this.lastArtificialBlinkTime = 0; // Cooldown after artificial blinks
      this.maxHistoryLength = 30; // 1 second at 30fps
      this.smoothingWindow = 3; // Moving average to smooth EAR
    }
    async detectBlink(landmarks) {
      try {
        // Calculate current EAR
        const currentEAR = EyeAspectRatioCalculator.calculate(landmarks);
        // Add to history
        this.earHistory.push({ ...currentEAR, timestamp: Date.now() });
        if (this.earHistory.length > this.maxHistoryLength) {
          this.earHistory.shift();
        }
        // Smooth EAR with moving average
        const smoothEAR = this.getSmoothedEAR();
        const now = Date.now();
        // Configurable parameters
        const EAR_THRESHOLD = 0.21; // Stricter
        const MIN_BLINK_FRAMES = 3; // More robust
        const MIN_BLINK_DURATION = 120;
        const MAX_BLINK_DURATION = 400;
        const MIN_CLOSED_DURATION = 80; // Ignore micro-closures
        const ARTIFICIAL_COOLDOWN = 300; // ms after artificial
        // Cooldown after artificial blinks
        if (now - this.lastArtificialBlinkTime < ARTIFICIAL_COOLDOWN) {
          return {
            success: true,
            data: {
              ear: smoothEAR,
              isBlinking: false,
              blinkDuration: 0,
              closedFrames: 0,
              naturalness: 0,
              confidence: 0.5,
              timestamp: now,
            },
          };
        }
        // Look for open-closed-open cycle
        let isBlinking = false;
        let blinkDuration = 0;
        let naturalness = 0;
        let confidence = 0.5;
        let closedStart = -1;
        let closedEnd = -1;
        let openBefore = -1;
        let openAfter = -1;
        let closedFrames = 0;
        for (let i = this.earHistory.length - 2; i >= 0; i--) {
          if (this.earHistory[i].ear >= EAR_THRESHOLD && openAfter === -1) {
            openAfter = i;
          }
          if (
            this.earHistory[i].ear < EAR_THRESHOLD &&
            closedEnd === -1 &&
            openAfter !== -1
          ) {
            closedEnd = i;
          }
          if (closedEnd !== -1 && this.earHistory[i].ear < EAR_THRESHOLD) {
            closedStart = i;
          }
          if (closedStart !== -1 && this.earHistory[i].ear >= EAR_THRESHOLD) {
            openBefore = i;
            break;
          }
        }
        // If open-closed-open cycle detected
        if (
          openBefore !== -1 &&
          closedStart !== -1 &&
          closedEnd !== -1 &&
          openAfter !== -1
        ) {
          const start = this.earHistory[closedStart].timestamp;
          const end = this.earHistory[closedEnd].timestamp;
          blinkDuration = end - start;
          closedFrames = closedEnd - closedStart + 1;
          if (blinkDuration < MIN_CLOSED_DURATION) {
            // Ignore micro-closures
            return {
              success: true,
              data: {
                ear: smoothEAR,
                isBlinking: false,
                blinkDuration,
                closedFrames,
                naturalness: 0,
                confidence: 0.5,
                timestamp: now,
              },
            };
          }
          if (
            blinkDuration >= MIN_BLINK_DURATION &&
            blinkDuration <= MAX_BLINK_DURATION &&
            closedFrames >= MIN_BLINK_FRAMES
          ) {
            isBlinking = true;
            naturalness = 1.0;
            confidence = 0.9;
            this.lastBlinkTime = now;
          }
        }
        // Anti-spoofing: blinks too frequent
        const timeSinceLastBlink = now - this.lastBlinkTime;
        if (timeSinceLastBlink < 500 && isBlinking) {
          naturalness *= 0.5;
        }
        // If artificial, activate cooldown
        if (
          !isBlinking &&
          openBefore !== -1 &&
          closedStart !== -1 &&
          closedEnd !== -1 &&
          openAfter !== -1
        ) {
          this.lastArtificialBlinkTime = now;
        }
        const analysis = {
          ear: smoothEAR,
          isBlinking,
          blinkDuration,
          closedFrames,
          naturalness,
          confidence,
          timestamp: now,
        };
        return {
          success: true,
          data: analysis,
        };
      } catch (error) {
        const appError = {
          code: "BLINK_DETECTION_FAILED",
          message:
            error instanceof Error ? error.message : "Blink detection failed",
          timestamp: Date.now(),
        };
        return {
          success: false,
          error: appError,
        };
      }
    }
    calculateBlinkConfidence(ear, pattern) {
      let confidence = 0.5;
      // EAR threshold confidence
      if (ear.average < 0.2)
        confidence += 0.3; // Strong eye closure
      else if (ear.average < 0.25) confidence += 0.2; // Moderate closure
      // Pattern confidence
      confidence += pattern.naturalness * 0.3;
      // Duration confidence
      if (pattern.blinkDuration >= 150 && pattern.blinkDuration <= 400) {
        confidence += 0.2; // Natural duration
      }
      return Math.max(0, Math.min(1, confidence));
    }
    // Moving average filter to smooth EAR
    getSmoothedEAR() {
      const window = this.smoothingWindow;
      if (this.earHistory.length < window) {
        return this.earHistory[this.earHistory.length - 1] || { ear: 0 };
      }
      const recent = this.earHistory.slice(-window);
      const avg = recent.reduce((sum, e) => sum + e.ear, 0) / window;
      // Copy other properties from last EAR
      return { ...this.earHistory[this.earHistory.length - 1], ear: avg };
    }
    reset() {
      this.earHistory = [];
      this.lastBlinkTime = 0;
    }
    getBlinkFrequency() {
      // Calculate blinks per minute based on recent history
      const recentHistory = this.earHistory.slice(-900); // Last 30 seconds at 30fps
      if (recentHistory.length < 150) return 0; // Need at least 5 seconds
      let blinkCount = 0;
      let inBlink = false;
      const threshold = 0.25;
      for (const ear of recentHistory) {
        if (ear.ear < threshold && !inBlink) {
          blinkCount++;
          inBlink = true;
        } else if (ear.ear >= threshold && inBlink) {
          inBlink = false;
        }
      }
      // Convert to blinks per minute
      const timeSpan =
        (recentHistory[recentHistory.length - 1].timestamp -
          recentHistory[0].timestamp) /
        1000 /
        60;
      return timeSpan > 0 ? blinkCount / timeSpan : 0;
    }
  }

  class LivenessDetector {
    constructor(config = {}) {
      this.isActive = false;
      this.isProcessing = true; // Control de procesamiento entre gestos
      this.startTime = 0;
      this.completedGestures = [];
      this.currentGestureIndex = 0;
      this.currentGestureProgress = 0;
      // Para análisis temporal de gestos
      this.previousEyeLandmarks = null;
      this.previousMouthLandmarks = null;
      this.lastBlinkTime = 0;
      this.lastSmileTime = 0;
      this.defaultConfig = {
        requiredGestures: ["blink", "smile", "head_rotation"], // Los 3 gestos son necesarios
        timeout: 30000, // 30 seconds
        minConfidence: 0.7,
        minLivenessScore: 0.6, // Reducido de 0.8 a 0.6 (60%) para ser más realista
        gestureThresholds: {
          blink: 0.15, // EAR threshold for blink
          smile: 0.07, // CORREGIDO: Umbral crítico de 0.07 para detección correcta
          headRotation: 0.4, // AJUSTADO: Umbral de 0.4 para mayor sensibilidad en movimientos de cabeza
        },
      };
      this.config = { ...this.defaultConfig, ...config };
      // Usar MediaPipe Real Service
      this.mediaPipeService = new MediaPipeRealService();
      this.blinkDetector = new BlinkDetector();
      // Initialize gesture state
      this.gestureState = {
        blink: {
          isDetected: false,
          confidence: 0,
          naturalness: 0,
          startTime: 0,
          lastDetection: 0,
        },
        smile: {
          isDetected: false,
          confidence: 0,
          naturalness: 0,
          startTime: 0,
          lastDetection: 0,
        },
        head_rotation: {
          isDetected: false,
          confidence: 0,
          naturalness: 0,
          startTime: 0,
          lastDetection: 0,
        },
      };
    }
    async initialize() {
      await this.mediaPipeService.initialize();
    }
    // ============================================================================
    // Session Management
    // ============================================================================
    startSession() {
      this.isActive = true;
      this.startTime = Date.now();
      this.completedGestures = [];
      this.currentGestureIndex = 0;
      this.currentGestureProgress = 0;
      // Reset gesture state
      Object.keys(this.gestureState).forEach((key) => {
        this.gestureState[key] = {
          isDetected: false,
          confidence: 0,
          naturalness: 0,
          startTime: 0,
          lastDetection: 0,
        };
      });
      return this.getProgress();
    }
    stopSession() {
      this.isActive = false;
      this.completedGestures = [];
      this.currentGestureIndex = 0;
      this.currentGestureProgress = 0;
    }
    isSessionActive() {
      return this.isActive;
    }
    getProgress() {
      const currentGesture =
        this.config.requiredGestures[this.currentGestureIndex];
      const completedTypes = this.completedGestures.map((g) => g.type);
      const overallProgress =
        this.completedGestures.length / this.config.requiredGestures.length;
      // Calculate current gesture progress
      if (this.currentGestureIndex < this.config.requiredGestures.length) {
        const currentType =
          this.config.requiredGestures[this.currentGestureIndex];
        this.currentGestureProgress = this.gestureState[currentType].confidence;
      }
      // Build gesture details
      const gestureDetails = {};
      this.config.requiredGestures.forEach((gestureType) => {
        const state = this.gestureState[gestureType];
        let status = "pending";
        if (this.completedGestures.some((g) => g.type === gestureType)) {
          status = "completed";
        } else if (gestureType === currentGesture) {
          status = "current";
        }
        gestureDetails[gestureType] = {
          status,
          progress: state.confidence,
          instruction: this.getGestureInstruction(gestureType),
        };
      });
      return {
        currentGesture,
        completedGestures: completedTypes,
        progress: overallProgress,
        instruction: this.getCurrentInstruction(),
        currentGestureProgress: this.currentGestureProgress,
        gestureDetails,
      };
    }
    // ============================================================================
    // Advanced Gesture Detection
    // ============================================================================
    async processFrame(videoElement) {
      if (!this.isActive || !this.mediaPipeService.isInitialized()) {
        return null;
      }
      try {
        // Process frame with MediaPipe MODERNO
        const mediaPipeLandmarks =
          await this.mediaPipeService.detectFaces(videoElement);
        if (!mediaPipeLandmarks || mediaPipeLandmarks.length === 0) {
          return null;
        }
        // Convertir landmarks de MediaPipe al formato esperado por el detector
        const landmarks = mediaPipeLandmarks.map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
          z: landmark.z || 0,
        }));
        const currentGesture =
          this.config.requiredGestures[this.currentGestureIndex];
        if (!currentGesture) {
          return null;
        }
        // Detect current gesture ONLY (no todos los gestos)
        const gestureResult = await this.detectGesture(landmarks);
        // Log para debugging
        if (gestureResult) {
          console.log(
            `🎯 Gesto: ${gestureResult.type}, Detectado: ${gestureResult.detected}, Confianza: ${gestureResult.confidence.toFixed(2)}`
          );
        }
        if (gestureResult && gestureResult.detected) {
          // Gesture completed
          this.completeGesture(currentGesture, gestureResult);
          // IMPORTANTE: Pausar antes de pasar al siguiente gesto
          console.log(
            `⏸️ Gesto ${currentGesture} completado. Pausando 2 segundos antes del siguiente...`
          );
          // Emitir evento de gesto completado
          const nextGesture =
            this.currentGestureIndex + 1 < this.config.requiredGestures.length
              ? this.config.requiredGestures[this.currentGestureIndex + 1]
              : undefined;
          // 🔧 DEBUG: Log antes de emitir evento
          console.log(
            `📤 Emitiendo evento gesture-completed para: ${currentGesture} -> ${nextGesture || "fin"}`
          );
          // Dispatch custom event
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("gesture-completed", {
                detail: { gestureType: currentGesture, nextGesture },
              })
            );
            console.log(`✅ Evento gesture-completed emitido exitosamente`);
          } else {
            console.warn(
              "❌ window no disponible para emitir gesture-completed"
            );
          }
          // CORREGIDO: Eliminar timer automático, solo avanzar cuando se detecte
          console.log("✅ Gesto completado, verificando si continuar...");
          // Check if all gestures are completed
          if (
            this.completedGestures.length >= this.config.requiredGestures.length
          ) {
            console.log("🎯 Todos los gestos completados, finalizando sesión");
            // 🔧 NUEVO: Emitir evento de gestos completados
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("all-gestures-completed", {
                  detail: {
                    completedGestures: this.completedGestures,
                    finalResult: this.getResult(),
                  },
                })
              );
            }
            this.stopSession();
          } else {
            // Move to next gesture IMMEDIATELY when current is completed
            this.currentGestureIndex++;
            if (
              this.currentGestureIndex < this.config.requiredGestures.length
            ) {
              const nextGesture =
                this.config.requiredGestures[this.currentGestureIndex];
              console.log(`🔄 Pasando al siguiente gesto: ${nextGesture}`);
            }
          }
        }
        return gestureResult;
      } catch (error) {
        console.error("Error processing frame:", error);
        return null;
      }
    }
    detectGesture(landmarks) {
      if (landmarks.length < 468) {
        return {
          type:
            this.config.requiredGestures[this.currentGestureIndex] || "blink",
          detected: false,
          confidence: 0,
          timestamp: Date.now(),
          naturalness: 0,
          progress: 0,
          instruction: "Esperando landmarks válidos...",
        };
      }
      // Obtener el gesto actual que necesitamos detectar
      const currentGestureType =
        this.config.requiredGestures[this.currentGestureIndex];
      if (!currentGestureType) {
        return {
          type: "blink",
          detected: false,
          confidence: 0,
          timestamp: Date.now(),
          naturalness: 0,
          progress: 0,
          instruction: "Todos los gestos completados",
        };
      }
      let result;
      let instruction;
      // IMPORTANTE: Solo detectar el gesto actual requerido, NO todos
      console.log(`🎯 Detectando SOLO el gesto: ${currentGestureType}`);
      switch (currentGestureType) {
        case "blink":
          result = this.detectBlink(landmarks);
          instruction = result.detected
            ? "Parpadeo detectado correctamente"
            : "Parpadea naturalmente";
          break;
        case "smile":
          result = this.detectSmile(landmarks);
          instruction = result.detected
            ? "Sonrisa detectada correctamente"
            : "Sonríe de forma natural";
          break;
        case "head_rotation":
          result = this.detectHeadRotation(landmarks);
          instruction = result.detected
            ? "Movimiento de cabeza detectado"
            : "Gira tu cabeza suavemente";
          // 🔍 LOG ESPECIAL para rotación de cabeza
          console.log(
            `🎯 GESTO ACTUAL: head_rotation | Confianza: ${result.confidence.toFixed(3)} | Detectado: ${result.detected}`
          );
          break;
        default:
          result = { confidence: 0, naturalness: 0, detected: false };
          instruction = "Gesto no reconocido";
      }
      // Actualizar estado del gesto
      this.gestureState[currentGestureType].confidence = result.confidence;
      this.gestureState[currentGestureType].naturalness = result.naturalness;
      this.gestureState[currentGestureType].lastDetection = Date.now();
      return {
        type: currentGestureType,
        detected: result.detected, // 🔧 CORREGIDO: Usar resultado directo de cada método
        confidence: result.confidence,
        timestamp: Date.now(),
        naturalness: result.naturalness,
        progress: Math.min(1, result.confidence),
        instruction,
      };
    }
    detectBlink(landmarks) {
      try {
        console.log(`🔍 detectBlink - Landmarks: ${landmarks.length}`);
        if (landmarks.length < 468) {
          console.log(`⚠️ Landmarks insuficientes, usando método alternativo`);
          return this.detectBlinkFromLimitedLandmarks(landmarks);
        }
        // Usar índices correctos de MediaPipe 478 (del proyecto que funcionaba)
        const LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380];
        const RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
        // Umbrales del proyecto que funcionaba
        const OPEN_THRESHOLD = 0.25;
        const CLOSED_THRESHOLD = 0.15;
        const BLINK_THRESHOLD = 0.2;
        // Calcular EAR para cada ojo usando los índices correctos
        const leftEAR = this.calculateSingleEyeEAR(landmarks, LEFT_EYE_INDICES);
        const rightEAR = this.calculateSingleEyeEAR(
          landmarks,
          RIGHT_EYE_INDICES
        );
        const avgEAR = (leftEAR + rightEAR) / 2;
        console.log(
          `📊 EAR - Izquierdo: ${leftEAR.toFixed(3)}, Derecho: ${rightEAR.toFixed(3)}, Promedio: ${avgEAR.toFixed(3)}`
        );
        console.log(
          `🎯 Umbrales: OPEN=${OPEN_THRESHOLD}, CLOSED=${CLOSED_THRESHOLD}, BLINK=${BLINK_THRESHOLD}`
        );
        // Lógica del proyecto que funcionaba
        let phase = "open";
        if (avgEAR < CLOSED_THRESHOLD) phase = "closed";
        else if (avgEAR < BLINK_THRESHOLD) phase = "closing";
        else if (avgEAR < OPEN_THRESHOLD) phase = "opening";
        const isBlinking = phase === "closing" || phase === "closed";
        console.log(`🎭 Fase: ${phase}, ¿Parpadeando?: ${isBlinking}`);
        if (isBlinking) {
          // Confianza y naturalidad del proyecto que funcionaba
          const confidence = Math.max(0, 1 - Math.abs(leftEAR - rightEAR));
          const naturalness = Math.max(0, 1 - Math.abs(leftEAR - rightEAR) * 2);
          return {
            detected: true,
            confidence: Math.max(0.7, confidence),
            naturalness: Math.max(0.6, naturalness),
          };
        }
        // Cuando ojos están abiertos
        const openEyeConfidence = Math.max(0.1, avgEAR * 0.8);
        return {
          detected: false,
          confidence: openEyeConfidence,
          naturalness: 0.8,
        };
      } catch (error) {
        console.warn("Error detectando parpadeo real:", error);
        return this.detectBlinkFromLimitedLandmarks(landmarks);
      }
    }
    // Método para calcular EAR de un solo ojo (del proyecto que funcionaba)
    calculateSingleEyeEAR(landmarks, eyeIndices) {
      try {
        const eyePoints = eyeIndices.map((index) => landmarks[index]);
        const p1 = eyePoints[0];
        const p2 = eyePoints[1];
        const p3 = eyePoints[2];
        const p4 = eyePoints[3];
        const p5 = eyePoints[4];
        const p6 = eyePoints[5];
        const verticalDist1 = this.euclideanDistance(p2, p6);
        const verticalDist2 = this.euclideanDistance(p3, p5);
        const horizontalDist = this.euclideanDistance(p1, p4);
        if (horizontalDist === 0) return 0;
        return (verticalDist1 + verticalDist2) / (2.0 * horizontalDist);
      } catch (error) {
        return 0;
      }
    }
    // Método para calcular distancia euclidiana (del proyecto que funcionaba)
    euclideanDistance(p1, p2) {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    // Detectar parpadeo con landmarks limitados usando análisis temporal
    detectBlinkFromLimitedLandmarks(landmarks) {
      // Analizar cambios en landmarks de ojos a lo largo del tiempo
      const currentTime = Date.now();
      console.log(`🔄 detectBlinkFromLimitedLandmarks - Método alternativo`);
      if (!this.previousEyeLandmarks) {
        this.previousEyeLandmarks = landmarks.slice(33, 43); // Aproximar región de ojos
        this.lastBlinkTime = currentTime;
        console.log(`📝 Inicializando landmarks previos de ojos`);
        return { detected: false, confidence: 0.2, naturalness: 0.8 }; // Confianza inicial más alta
      }
      // Calcular diferencia en posición de landmarks de ojos
      let totalMovement = 0;
      const eyeRegionStart = Math.min(33, landmarks.length - 10);
      const eyeRegionEnd = Math.min(43, landmarks.length);
      for (
        let i = eyeRegionStart;
        i < eyeRegionEnd && i < this.previousEyeLandmarks.length;
        i++
      ) {
        const prev = this.previousEyeLandmarks[i - eyeRegionStart];
        const curr = landmarks[i];
        if (prev && curr) {
          const movement = Math.sqrt(
            Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
          );
          totalMovement += movement;
        }
      }
      // Detectar parpadeo basado en movimiento súbito
      const avgMovement = totalMovement / Math.min(10, landmarks.length);
      const isBlinking =
        avgMovement > 0.02 && currentTime - this.lastBlinkTime > 250; // Umbral medio
      if (isBlinking) {
        this.lastBlinkTime = currentTime;
        return {
          detected: true,
          confidence: Math.min(0.9, avgMovement * 30), // Mayor sensibilidad
          naturalness: 0.85,
        };
      }
      // Actualizar landmarks previos
      this.previousEyeLandmarks = landmarks.slice(eyeRegionStart, eyeRegionEnd);
      return {
        detected: false,
        confidence: Math.max(0.2, avgMovement * 10),
        naturalness: 0.8,
      }; // Confianza mínima más alta
    }
    detectSmile(landmarks) {
      try {
        console.log(`😊 detectSmile - Landmarks: ${landmarks.length}`);
        if (landmarks.length < 468) {
          return this.detectSmileFromLimitedLandmarks(landmarks);
        }
        // Usar índices exactos del proyecto que funcionaba
        const MOUTH_INDICES = [
          61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 78, 95, 88,
          178, 87, 14, 317, 402,
        ];
        // Extraer landmarks de boca
        const mouthLandmarks = MOUTH_INDICES.map((index) => ({
          x: landmarks[index]?.x || 0,
          y: landmarks[index]?.y || 0,
        }));
        if (mouthLandmarks.length < 20) {
          return this.detectSmileFromLimitedLandmarks(landmarks);
        }
        // Análisis de forma de boca (del proyecto que funcionaba)
        const leftCorner = mouthLandmarks[0]; // Esquina izquierda
        const rightCorner = mouthLandmarks[6]; // Esquina derecha
        const center = mouthLandmarks[3]; // Centro
        // Calcular curvatura de boca (positivo = sonrisa, negativo = ceño)
        const avgCornerY = (leftCorner.y + rightCorner.y) / 2;
        const curvature = center.y - avgCornerY; // Positivo para curva hacia arriba
        // Calcular asimetría
        const asymmetry = Math.abs(leftCorner.y - rightCorner.y);
        // Umbrales del proyecto que funcionaba
        const SMILE_THRESHOLD = this.config.gestureThresholds.smile; // Usar umbral de configuración
        const isSmiling = curvature > SMILE_THRESHOLD;
        console.log(
          `📊 Curvatura: ${curvature.toFixed(4)}, Umbral: ${SMILE_THRESHOLD}, ¿Sonriendo?: ${isSmiling}`
        );
        if (isSmiling) {
          // Confianza y naturalidad del proyecto que funcionaba
          const intensity = Math.min(1, curvature / 0.1); // Normalizar a 0-1
          const confidence = Math.max(0.7, intensity);
          const naturalness = Math.max(0.6, 1 - asymmetry * 10); // Menos asimetría = más natural
          return {
            detected: true,
            confidence: Math.min(1, confidence),
            naturalness: Math.max(0.5, naturalness),
          };
        }
        return {
          detected: false,
          confidence: Math.max(0.1, Math.abs(curvature) * 5), // Confianza baja cuando no sonríe
          naturalness: 0.8,
        };
      } catch (error) {
        console.warn("Error detectando sonrisa real:", error);
        return this.detectSmileFromLimitedLandmarks(landmarks);
      }
    }
    // Detectar sonrisa con landmarks limitados usando análisis temporal
    detectSmileFromLimitedLandmarks(landmarks) {
      const currentTime = Date.now();
      if (!this.previousMouthLandmarks) {
        this.previousMouthLandmarks = landmarks.slice(60, 85); // Aproximar región de boca
        this.lastSmileTime = currentTime;
        return { detected: false, confidence: 0, naturalness: 0.8 };
      }
      // Calcular diferencia en forma de boca
      let totalChange = 0;
      const mouthRegionStart = Math.min(60, landmarks.length - 25);
      const mouthRegionEnd = Math.min(85, landmarks.length);
      for (
        let i = mouthRegionStart;
        i < mouthRegionEnd &&
        i < this.previousMouthLandmarks.length + mouthRegionStart;
        i++
      ) {
        const prev = this.previousMouthLandmarks[i - mouthRegionStart];
        const curr = landmarks[i];
        if (prev && curr) {
          const change = Math.sqrt(
            Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
          );
          totalChange += change;
        }
      }
      // Detectar sonrisa basado en expansión horizontal de boca
      const avgChange = totalChange / Math.min(25, landmarks.length);
      const isSmiling =
        avgChange > 0.04 && currentTime - this.lastSmileTime > 800; // Umbral mucho más alto
      if (isSmiling) {
        this.lastSmileTime = currentTime;
        return {
          detected: true,
          confidence: Math.min(0.9, avgChange * 30),
          naturalness: 0.85,
        };
      }
      // Actualizar landmarks previos
      this.previousMouthLandmarks = landmarks.slice(
        mouthRegionStart,
        mouthRegionEnd
      );
      return { detected: false, confidence: avgChange * 8, naturalness: 0.8 };
    }
    detectHeadRotation(landmarks) {
      try {
        console.log(`🔄 detectHeadRotation - Landmarks: ${landmarks.length}`);
        if (landmarks.length < 468) {
          console.log(`❌ Landmarks insuficientes para rotación de cabeza`);
          return { detected: false, confidence: 0, naturalness: 0 };
        }
        // Usar índices exactos del proyecto que funcionaba
        const POSE_INDICES = [
          1, // Punta de nariz
          33, // Esquina ojo izquierdo
          362, // Esquina ojo derecho
          61, // Esquina boca izquierda
          291, // Esquina boca derecha
          199, // Mentón
        ];
        // Extraer landmarks de pose
        const poseLandmarks = POSE_INDICES.map((index) => ({
          x: landmarks[index]?.x || 0,
          y: landmarks[index]?.y || 0,
          z: landmarks[index]?.z || 0,
        }));
        if (poseLandmarks.length < 6) {
          console.log(`❌ Landmarks de pose insuficientes`);
          return { detected: false, confidence: 0, naturalness: 0 };
        }
        // Calcular rotación de cabeza (del proyecto que funcionaba)
        const noseTip = poseLandmarks[0];
        const leftEye = poseLandmarks[1];
        const rightEye = poseLandmarks[2];
        // 🔍 LOGS DETALLADOS - Posiciones exactas
        console.log(
          `👃 Nariz: (${noseTip.x.toFixed(3)}, ${noseTip.y.toFixed(3)})`
        );
        console.log(
          `👁️ Ojo Izq: (${leftEye.x.toFixed(3)}, ${leftEye.y.toFixed(3)})`
        );
        console.log(
          `👁️ Ojo Der: (${rightEye.x.toFixed(3)}, ${rightEye.y.toFixed(3)})`
        );
        // Calcular rotación horizontal (yaw) basada en distancia de ojos a nariz
        const leftEyeDistance = this.euclideanDistance(noseTip, leftEye);
        const rightEyeDistance = this.euclideanDistance(noseTip, rightEye);
        // 🔍 LOGS DETALLADOS - Distancias
        console.log(
          `📏 Distancia Ojo Izq-Nariz: ${leftEyeDistance.toFixed(4)}`
        );
        console.log(
          `📏 Distancia Ojo Der-Nariz: ${rightEyeDistance.toFixed(4)}`
        );
        console.log(
          `📏 Diferencia: ${(rightEyeDistance - leftEyeDistance).toFixed(4)}`
        );
        console.log(
          `📏 Máximo: ${Math.max(leftEyeDistance, rightEyeDistance).toFixed(4)}`
        );
        const yawRotation =
          (rightEyeDistance - leftEyeDistance) /
          Math.max(leftEyeDistance, rightEyeDistance);
        // 🔍 LOGS DETALLADOS - Valores de rotación
        console.log(`🎯 Yaw Rotation CALCULADO: ${yawRotation.toFixed(6)}`);
        console.log(
          `🎯 Yaw Rotation ABSOLUTO: ${Math.abs(yawRotation).toFixed(6)}`
        );
        // Usar la configuración configurable
        const ROTATION_THRESHOLD = this.config.gestureThresholds.headRotation;
        const isRotating = Math.abs(yawRotation) > ROTATION_THRESHOLD;
        // 🔍 LOGS DETALLADOS - Comparación con umbral
        console.log(`⚖️ UMBRAL ACTUAL: ${ROTATION_THRESHOLD}`);
        console.log(
          `⚖️ COMPARACIÓN: ${Math.abs(yawRotation).toFixed(6)} > ${ROTATION_THRESHOLD} = ${isRotating}`
        );
        if (Math.abs(yawRotation) > 0.1) {
          console.log(
            `🚨 MOVIMIENTO DETECTADO - Valor: ${Math.abs(yawRotation).toFixed(6)}`
          );
        } else {
          console.log(`😴 QUIETO - Valor: ${Math.abs(yawRotation).toFixed(6)}`);
        }
        if (isRotating) {
          // Confianza y naturalidad del proyecto que funcionaba
          const rotationIntensity = Math.min(1, Math.abs(yawRotation) / 0.3);
          const confidence = Math.max(0.7, rotationIntensity);
          const naturalness = Math.max(0.6, 1 - Math.abs(yawRotation) * 2); // Menos rotación extrema = más natural
          console.log(
            `✅ ROTACIÓN DETECTADA! Intensidad: ${rotationIntensity.toFixed(3)}, Confianza: ${confidence.toFixed(3)}`
          );
          return {
            detected: true,
            confidence: Math.min(1, confidence),
            naturalness: Math.max(0.5, naturalness),
          };
        }
        // 🔧 CORREGIDO: Cuando NO hay rotación, confianza debe ser 0
        console.log(
          `❌ NO hay rotación suficiente. Valor: ${Math.abs(yawRotation).toFixed(6)}, Necesita > ${ROTATION_THRESHOLD}`
        );
        return {
          detected: false,
          confidence: 0, // Confianza 0 cuando no hay rotación
          naturalness: 0.8,
        };
      } catch (error) {
        console.warn("Error detectando rotación de cabeza real:", error);
        return { detected: false, confidence: 0, naturalness: 0 };
      }
    }
    calculateEyeOpenness(eyePoints) {
      // Simular cálculo de apertura de ojo
      if (eyePoints.length < 8) return 0.5;
      // Calcular altura del ojo (simulado)
      const topY = Math.min(...eyePoints.slice(0, 4).map((p) => p.y));
      const bottomY = Math.max(...eyePoints.slice(4, 8).map((p) => p.y));
      const height = bottomY - topY;
      return Math.max(0, Math.min(1, height * 10)); // Normalizar a [0,1]
    }
    // ============================================================================
    // Helper Methods for Gesture Detection
    // ============================================================================
    getEyeLandmarks(landmarks, eye) {
      // MediaPipe face mesh indices for eyes (6 puntos para cálculo de EAR)
      const eyeIndices =
        eye === "left"
          ? [33, 7, 163, 144, 145, 153] // Ojo izquierdo: esquinas + puntos verticales
          : [362, 382, 381, 380, 374, 373]; // Ojo derecho: esquinas + puntos verticales
      const eyeLandmarks = eyeIndices.map((i) => landmarks[i]).filter(Boolean);
      return eyeLandmarks.length === 6 ? eyeLandmarks : null;
    }
    calculateEAR(eyeLandmarks) {
      if (eyeLandmarks.length < 6) return 1;
      // Simplified EAR calculation using key points
      const p1 = eyeLandmarks[0];
      const p2 = eyeLandmarks[1];
      const p3 = eyeLandmarks[2];
      const p4 = eyeLandmarks[3];
      const p5 = eyeLandmarks[4];
      const p6 = eyeLandmarks[5];
      const A = this.distance(p1, p2);
      const B = this.distance(p3, p4);
      const C = this.distance(p5, p6);
      return (A + B) / (2.0 * C);
    }
    getMouthLandmarks(landmarks) {
      // MediaPipe face mesh indices for mouth corners and center points
      const mouthIndices = [
        61, // Esquina izquierda
        291, // Esquina derecha
        13, // Centro superior
        14, // Centro inferior
      ];
      const mouthLandmarks = mouthIndices
        .map((i) => landmarks[i])
        .filter(Boolean);
      return mouthLandmarks.length === 4 ? mouthLandmarks : null;
    }
    calculateSmileIntensity(mouthLandmarks) {
      if (mouthLandmarks.length < 4) return 0;
      // Calculate mouth width vs height ratio
      const width = this.distance(mouthLandmarks[0], mouthLandmarks[1]);
      const height = this.distance(mouthLandmarks[2], mouthLandmarks[3]);
      return width / Math.max(height, 1);
    }
    calculateHeadPose(landmarks) {
      if (landmarks.length < 468) return null;
      // MediaPipe key points for head pose calculation
      const noseTip = landmarks[1]; // Punta de la nariz
      const leftEye = landmarks[33]; // Esquina interna ojo izquierdo
      const rightEye = landmarks[263]; // Esquina interna ojo derecho
      const leftMouth = landmarks[61]; // Esquina izquierda boca
      const rightMouth = landmarks[291]; // Esquina derecha boca
      const chin = landmarks[175]; // Barbilla
      const forehead = landmarks[10]; // Frente
      // Centro de los ojos
      const eyeCenter = {
        x: (leftEye.x + rightEye.x) / 2,
        y: (leftEye.y + rightEye.y) / 2,
      };
      // Centro de la boca
      const mouthCenter = {
        x: (leftMouth.x + rightMouth.x) / 2,
        y: (leftMouth.y + rightMouth.y) / 2,
      };
      // Yaw: rotación izquierda-derecha (basado en posición nariz vs centro ojos)
      const faceCenterX = (leftEye.x + rightEye.x) / 2;
      const noseOffset = noseTip.x - faceCenterX;
      const eyeDistance = Math.abs(rightEye.x - leftEye.x);
      const yaw = (noseOffset / eyeDistance) * 2; // Normalizado
      // Pitch: rotación arriba-abajo (basado en relación nariz-ojos-boca)
      const verticalFaceCenter = (eyeCenter.y + mouthCenter.y) / 2;
      const noseVerticalOffset = noseTip.y - verticalFaceCenter;
      const faceHeight = Math.abs(forehead.y - chin.y);
      const pitch = (noseVerticalOffset / faceHeight) * 3; // Normalizado
      // Roll: inclinación (basado en línea de ojos)
      const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
      return { yaw, pitch, roll };
    }
    distance(p1, p2) {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    // ============================================================================
    // Naturalness Calculations
    // ============================================================================
    calculateBlinkNaturalness(duration) {
      // Natural blink duration: 100-400ms
      if (duration < 100 || duration > 400) return 0;
      if (duration >= 150 && duration <= 300) return 1;
      // Gradual falloff
      if (duration < 150) return duration / 150;
      return (400 - duration) / 100;
    }
    calculateSmileNaturalness(duration, intensity) {
      // Natural smile duration: 500ms - 3s
      if (duration < 500 || duration > 3000) return 0;
      if (duration >= 1000 && duration <= 2000) return 1;
      // Gradual falloff
      if (duration < 1000) return duration / 1000;
      return (3000 - duration) / 1000;
    }
    calculateHeadRotationNaturalness(duration, magnitude) {
      // Natural head rotation: 1-3s
      if (duration < 1000 || duration > 3000) return 0;
      if (duration >= 1500 && duration <= 2500) return 1;
      // Gradual falloff
      if (duration < 1500) return duration / 1500;
      return (3000 - duration) / 500;
    }
    // ============================================================================
    // Gesture Completion
    // ============================================================================
    completeGesture(gestureType, result) {
      // EVITAR DUPLICADOS: Solo agregar si no existe ya este tipo de gesto
      const alreadyExists = this.completedGestures.some(
        (g) => g.type === gestureType
      );
      if (!alreadyExists) {
        console.log(
          `✅ Agregando gesto ${gestureType} a la lista de completados`
        );
        this.completedGestures.push(result);
        this.gestureState[gestureType].isDetected = true;
      } else {
        console.log(
          `⚠️ Gesto ${gestureType} ya fue completado, ignorando duplicado`
        );
      }
    }
    // ============================================================================
    // Instructions and Feedback
    // ============================================================================
    getCurrentInstruction() {
      if (this.currentGestureIndex >= this.config.requiredGestures.length) {
        return "Verificación completada";
      }
      const currentGesture =
        this.config.requiredGestures[this.currentGestureIndex];
      return this.getGestureInstruction(currentGesture);
    }
    getGestureInstruction(gestureType) {
      switch (gestureType) {
        case "blink":
          return "Parpadea naturalmente cuando estés listo";
        case "smile":
          return "Sonríe de forma natural y espontánea";
        case "head_rotation":
          return "Gira tu cabeza suavemente hacia los lados";
        default:
          return "Sigue las instrucciones en pantalla";
      }
    }
    // ============================================================================
    // Results and Configuration
    // ============================================================================
    getResult() {
      if (!this.isActive || this.completedGestures.length === 0) {
        return null;
      }
      const totalTime = Date.now() - this.startTime;
      const overallScore = this.calculateOverallScore();
      const isLive = overallScore >= this.config.minLivenessScore;
      return {
        isLive,
        overallScore,
        completedGestures: [...this.completedGestures],
        totalTime,
        confidence: overallScore,
        timestamp: Date.now(),
      };
    }
    calculateOverallScore() {
      if (this.completedGestures.length === 0) return 0;
      const gestureScores = this.completedGestures.map(
        (g) => g.confidence * g.naturalness
      );
      const averageScore =
        gestureScores.reduce((sum, score) => sum + score, 0) /
        gestureScores.length;
      // Bonus for completing all gestures quickly
      const timeBonus = Math.max(
        0,
        1 - this.completedGestures.length / this.config.requiredGestures.length
      );
      return Math.min(1, averageScore + timeBonus * 0.2);
    }
    updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
    }
    getConfig() {
      return { ...this.config };
    }
    // ============================================================================
    // Anti-Spoofing Helpers
    // ============================================================================
    validateVideoQuality(video) {
      const issues = [];
      let quality = 1.0;
      // Check video dimensions
      if (video.videoWidth < 300 || video.videoHeight < 300) {
        issues.push("Video demasiado pequeño");
        quality -= 0.2;
      }
      // Check if video is playing
      if (video.paused || video.ended) {
        issues.push("Video no está reproduciéndose");
        quality -= 0.5;
      }
      // Check video readiness
      if (video.readyState < 2) {
        issues.push("Video no está listo");
        quality -= 0.3;
      }
      return {
        isValid: issues.length === 0 && quality > 0.5,
        issues,
        quality: Math.max(0, quality),
      };
    }
    dispose() {
      this.mediaPipeService.dispose();
      this.blinkDetector.reset();
      this.stopSession();
    }
  }

  class FacialComparisonService {
    constructor() {
      this.SIMILARITY_THRESHOLD = 0.75;
      this.CONFIDENCE_THRESHOLD = 0.7;
    }
    // ============================================================================
    // Main Comparison Methods
    // ============================================================================
    comparefaces(storedFace, capturedFace) {
      // Extract features from both faces
      const storedFeatures = this.extractFeatures(storedFace);
      const capturedFeatures = this.extractFeatures(capturedFace);
      // Calculate different similarity metrics
      const landmarkSimilarity = this.compareLandmarks(
        storedFeatures.landmarks,
        capturedFeatures.landmarks
      );
      const imageSimilarity = this.compareImages(
        storedFeatures.imageHash,
        capturedFeatures.imageHash
      );
      const qualityScore = this.calculateQualityScore(storedFace, capturedFace);
      // Weighted average of similarities
      const overallSimilarity =
        landmarkSimilarity * 0.6 + imageSimilarity * 0.3 + qualityScore * 0.1;
      // Calculate confidence based on data quality and consistency
      const confidence = this.calculateConfidence(
        landmarkSimilarity,
        imageSimilarity,
        qualityScore,
        storedFace,
        capturedFace
      );
      const isMatch =
        overallSimilarity >= this.SIMILARITY_THRESHOLD &&
        confidence >= this.CONFIDENCE_THRESHOLD;
      return {
        isMatch,
        confidence,
        similarity: overallSimilarity,
        details: {
          landmarkSimilarity,
          imageSimilarity,
          qualityScore,
        },
      };
    }
    // ============================================================================
    // Feature Extraction
    // ============================================================================
    extractFeatures(faceData) {
      return {
        landmarks: this.normalizeLandmarks(faceData.landmarks),
        imageHash: this.calculateImageHash(faceData.image),
        keyPoints: this.extractKeyPoints(faceData.landmarks),
      };
    }
    normalizeLandmarks(landmarks) {
      if (!landmarks || landmarks.length === 0) return [];
      // Convert FaceLandmark[] to number[][] if needed
      const points = Array.isArray(landmarks[0])
        ? landmarks
        : landmarks.map((l) => [l.x, l.y]);
      // Find bounding box
      const xs = points.map((point) => point[0]);
      const ys = points.map((point) => point[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = maxX - minX;
      const height = maxY - minY;
      // Normalize to 0-1 range
      return points.map(([x, y]) => [(x - minX) / width, (y - minY) / height]);
    }
    extractKeyPoints(landmarks) {
      // Convert FaceLandmark[] to number[][] if needed
      const points = Array.isArray(landmarks[0])
        ? landmarks
        : landmarks.map((l) => [l.x, l.y]);
      // Extract key facial landmarks (simplified - would use MediaPipe indices in production)
      if (!points || points.length < 10) return {};
      const keyPoints = {};
      // Example key point extraction (placeholder indices)
      if (points.length >= 468) {
        // MediaPipe face mesh has 468 landmarks
        keyPoints.leftEye = { x: points[33][0], y: points[33][1] };
        keyPoints.rightEye = { x: points[263][0], y: points[263][1] };
        keyPoints.nose = { x: points[1][0], y: points[1][1] };
        keyPoints.leftMouth = { x: points[61][0], y: points[61][1] };
        keyPoints.rightMouth = { x: points[291][0], y: points[291][1] };
      }
      return keyPoints;
    }
    calculateImageHash(base64Image) {
      // Simple hash calculation (in production, use perceptual hashing)
      let hash = 0;
      for (let i = 0; i < base64Image.length; i++) {
        const char = base64Image.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return hash.toString(16);
    }
    // ============================================================================
    // Similarity Calculations
    // ============================================================================
    compareLandmarks(landmarks1, landmarks2) {
      if (
        !landmarks1 ||
        !landmarks2 ||
        landmarks1.length !== landmarks2.length
      ) {
        return 0;
      }
      if (landmarks1.length === 0 || landmarks2.length === 0) return 0;
      // Calculate Euclidean distance between corresponding landmarks
      let totalDistance = 0;
      let validPoints = 0;
      for (let i = 0; i < landmarks1.length; i++) {
        if (
          landmarks1[i] &&
          landmarks2[i] &&
          landmarks1[i].length >= 2 &&
          landmarks2[i].length >= 2
        ) {
          const dx = landmarks1[i][0] - landmarks2[i][0];
          const dy = landmarks1[i][1] - landmarks2[i][1];
          const distance = Math.sqrt(dx * dx + dy * dy);
          totalDistance += distance;
          validPoints++;
        }
      }
      if (validPoints === 0) return 0;
      const averageDistance = totalDistance / validPoints;
      // Convert distance to similarity (0-1, where 1 is perfect match)
      const similarity = Math.max(0, 1 - averageDistance * 2); // Scale factor of 2
      return Math.min(1, similarity);
    }
    compareImages(hash1, hash2) {
      // Simple hash comparison (placeholder)
      if (hash1 === hash2) return 1;
      // Calculate Hamming distance for hash similarity
      const minLen = Math.min(hash1.length, hash2.length);
      let differences = Math.abs(hash1.length - hash2.length);
      for (let i = 0; i < minLen; i++) {
        if (hash1[i] !== hash2[i]) {
          differences++;
        }
      }
      const maxLen = Math.max(hash1.length, hash2.length);
      if (maxLen === 0) return 1;
      const similarity = 1 - differences / maxLen;
      return Math.max(0, similarity);
    }
    calculateQualityScore(face1, face2) {
      const quality1 = this.assessImageQuality(face1);
      const quality2 = this.assessImageQuality(face2);
      // Return the minimum quality to ensure both images are good
      return Math.min(quality1, quality2);
    }
    assessImageQuality(faceData) {
      let quality = 1.0;
      // Check liveness score
      if (faceData.livenessScore < 0.8) {
        quality -= 0.8 - faceData.livenessScore;
      }
      // Check if image data exists
      if (!faceData.image || faceData.image.length < 100) {
        quality -= 0.5;
      }
      // Check landmarks count
      if (!faceData.landmarks || faceData.landmarks.length < 100) {
        quality -= 0.3;
      }
      return Math.max(0, quality);
    }
    // ============================================================================
    // Confidence Calculation
    // ============================================================================
    calculateConfidence(
      landmarkSimilarity,
      imageSimilarity,
      qualityScore,
      storedFace,
      capturedFace
    ) {
      let confidence = 0.5; // Base confidence
      // Boost confidence based on similarity consistency
      const similarityVariance = this.calculateVariance([
        landmarkSimilarity,
        imageSimilarity,
        qualityScore,
      ]);
      // Lower variance (more consistent) = higher confidence
      confidence += (1 - similarityVariance) * 0.3;
      // Boost confidence based on data quality
      const avgLivenessScore =
        (storedFace.livenessScore + capturedFace.livenessScore) / 2;
      confidence += avgLivenessScore * 0.2;
      // Boost confidence if both faces have good landmark count
      const landmarkQuality = Math.min(
        storedFace.landmarks.length / 468, // Assuming 468 is ideal
        capturedFace.landmarks.length / 468
      );
      confidence += landmarkQuality * 0.1;
      return Math.min(1, Math.max(0, confidence));
    }
    calculateVariance(values) {
      if (values.length === 0) return 1;
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const squaredDifferences = values.map((val) => Math.pow(val - mean, 2));
      const variance =
        squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
      return Math.sqrt(variance); // Return standard deviation
    }
    // ============================================================================
    // Batch Operations
    // ============================================================================
    findBestMatch(capturedFace, storedFaces) {
      if (!storedFaces || storedFaces.length === 0) {
        return { match: null, result: null, index: -1 };
      }
      let bestMatch = null;
      let bestResult = null;
      let bestIndex = -1;
      let bestSimilarity = 0;
      storedFaces.forEach((storedFace, index) => {
        const result = this.comparefaces(storedFace, capturedFace);
        if (result.isMatch && result.similarity > bestSimilarity) {
          bestMatch = storedFace;
          bestResult = result;
          bestIndex = index;
          bestSimilarity = result.similarity;
        }
      });
      return { match: bestMatch, result: bestResult, index: bestIndex };
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    setThresholds(similarity, confidence) {
      if (similarity >= 0 && similarity <= 1) {
        this.SIMILARITY_THRESHOLD = similarity;
      }
      if (confidence >= 0 && confidence <= 1) {
        this.CONFIDENCE_THRESHOLD = confidence;
      }
    }
    getThresholds() {
      return {
        similarity: this.SIMILARITY_THRESHOLD,
        confidence: this.CONFIDENCE_THRESHOLD,
      };
    }
  }

  /**
   * Servicio para generar códigos QR
   * Genera QR como imagen PNG en base64 para uso en firmas digitales
   */
  class QRService {
    /**
     * Genera un código QR como imagen PNG en base64
     * @param text - Texto o URL para el QR
     * @param options - Opciones de personalización
     * @returns Promise<string> - Imagen PNG en base64
     */
    static async generateQR(text, options = {}) {
      const {
        size = 256,
        margin = 4,
        background = "#ffffff",
        foreground = "#000000",
      } = options;
      try {
        // Usar librería QR externa o canvas para generar QR
        return await this.generateWithCanvas(text, {
          size,
          margin,
          background,
          foreground,
        });
      } catch (error) {
        console.error("Error generando QR:", error);
        throw new Error("No se pudo generar el código QR");
      }
    }
    /**
     * Genera QR usando Canvas API
     */
    static async generateWithCanvas(text, options) {
      // Crear canvas
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo crear contexto 2D");
      canvas.width = options.size;
      canvas.height = options.size;
      // Fondo
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, options.size, options.size);
      // Generar matriz QR (implementación simple)
      const qrMatrix = this.generateQRMatrix(text);
      const moduleCount = qrMatrix.length;
      const moduleSize = Math.floor(
        (options.size - options.margin * 2) / moduleCount
      );
      const offset = Math.floor((options.size - moduleSize * moduleCount) / 2);
      // Dibujar módulos QR
      ctx.fillStyle = options.foreground;
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qrMatrix[row][col]) {
            ctx.fillRect(
              offset + col * moduleSize,
              offset + row * moduleSize,
              moduleSize,
              moduleSize
            );
          }
        }
      }
      // Convertir a PNG base64
      return canvas.toDataURL("image/png");
    }
    /**
     * Genera matriz QR simple (implementación básica)
     * En producción, usar librería como qrcode.js
     */
    static generateQRMatrix(text) {
      // Implementación muy básica - en producción usar librería real
      const size = 21; // QR versión 1
      const matrix = Array(size)
        .fill(null)
        .map(() => Array(size).fill(false));
      // Patrones de búsqueda (esquinas)
      this.addFinderPattern(matrix, 0, 0);
      this.addFinderPattern(matrix, size - 7, 0);
      this.addFinderPattern(matrix, 0, size - 7);
      // Timing patterns (líneas)
      for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = i % 2 === 0;
        matrix[i][6] = i % 2 === 0;
      }
      // Datos simulados (en producción, codificar texto real)
      const hash = this.simpleHash(text);
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          if (!this.isReserved(i, j, size)) {
            matrix[i][j] = (hash + i + j) % 3 === 0;
          }
        }
      }
      return matrix;
    }
    /**
     * Agrega patrón de búsqueda en posición específica
     */
    static addFinderPattern(matrix, startRow, startCol) {
      const pattern = [
        [true, true, true, true, true, true, true],
        [true, false, false, false, false, false, true],
        [true, false, true, true, true, false, true],
        [true, false, true, true, true, false, true],
        [true, false, true, true, true, false, true],
        [true, false, false, false, false, false, true],
        [true, true, true, true, true, true, true],
      ];
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if (startRow + i < matrix.length && startCol + j < matrix[0].length) {
            matrix[startRow + i][startCol + j] = pattern[i][j];
          }
        }
      }
    }
    /**
     * Verifica si una posición está reservada para patrones
     */
    static isReserved(row, col, size) {
      // Patrones de búsqueda
      if (
        (row < 9 && col < 9) || // Top-left
        (row < 9 && col >= size - 8) || // Top-right
        (row >= size - 8 && col < 9)
      ) {
        // Bottom-left
        return true;
      }
      // Timing patterns
      if (row === 6 || col === 6) return true;
      return false;
    }
    /**
     * Hash simple para generar datos
     */
    static simpleHash(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // 32bit integer
      }
      return Math.abs(hash);
    }
    /**
     * Valida si una URL es válida para QR
     */
    static isValidQRText(text) {
      if (!text || text.length === 0) return false;
      if (text.length > 2953) return false; // Límite QR versión 40
      return true;
    }
    /**
     * Genera QR específico para firmas con formato estándar
     */
    static async generateSignatureQR(signatureUrl, signatureId, size = 256) {
      if (!this.isValidQRText(signatureUrl)) {
        throw new Error("URL de firma inválida para QR");
      }
      // QR con diseño específico para firmas
      const qrPng = await this.generateQR(signatureUrl, {
        size,
        margin: 6,
        background: "#ffffff",
        foreground: "#000000",
      });
      return qrPng;
    }
  }

  /**
   * Servicio para manejar firmas digitales con reconocimiento facial
   * Se comunica con la API de reconocimiento facial para procesar firmas
   */
  class SignatureService {
    constructor(config = {}) {
      this.apiBaseUrl =
        config.apiBaseUrl || "https://api-facialsafe.service.saferut.com";
      this.timeout = config.timeout || 30000;
      this.retries = config.retries || 2;
      this.eventDispatcher = config.eventDispatcher;
      console.log(
        `🔧 SignatureService creado - URL: ${this.apiBaseUrl}, Timeout: ${this.timeout}ms, Retries: ${this.retries}`
      );
    }
    emitEvent(eventName, detail) {
      if (this.eventDispatcher) {
        this.eventDispatcher(eventName, detail);
      }
    }
    /**
     * Valida la identidad de una persona antes de firmar
     */
    async validateForSigning(personId, imageBase64) {
      try {
        // Emitir evento de inicio de validación
        this.emitEvent("sign-validation-start", { person_id: personId });
        const response = await this.makeRequest("/validate_identity", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            person_id: personId,
            image_base64: imageBase64,
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          // Emitir evento de error de validación con detalles HTTP
          this.emitEvent("sign-validation-result", {
            success: false,
            confidence: 0,
            ready_to_sign: false,
            message:
              result.detail?.message || result.message || "Error en validación",
            http_status: response.status,
          });
          throw new Error(
            result.detail?.message || result.message || "Error en validación"
          );
        }
        const validationResult = {
          isValid: result.is_valid,
          confidence: result.confidence_score,
          person_id: result.person_id,
          person_name: result.person_name,
          ready_to_sign: result.is_valid && result.confidence_score >= 0.7,
          message: result.is_valid
            ? "Identidad verificada, listo para firmar"
            : result.recommendation,
        };
        // Emitir evento de resultado de validación
        this.emitEvent("sign-validation-result", {
          success: validationResult.isValid,
          confidence: validationResult.confidence,
          ready_to_sign: validationResult.ready_to_sign,
          message: validationResult.message,
          http_status: response.status,
        });
        return validationResult;
      } catch (error) {
        console.error("Error en validación para firma:", error);
        return {
          isValid: false,
          confidence: 0,
          person_id: personId,
          ready_to_sign: false,
          message: error instanceof Error ? error.message : "Error de conexión",
        };
      }
    }
    /**
     * Procesa la firma digital de un documento
     */
    async signDocument(signRequest, imageBase64, clientMetadata) {
      try {
        // Emitir evento de inicio de firma
        this.emitEvent("sign-request-start", {
          document_hash: signRequest.document_hash,
          person_id: signRequest.person_id,
        });
        // Emitir progreso de subida
        this.emitEvent("sign-request-progress", { status: "uploading" });
        // Obtener geolocalización si está disponible
        const geolocation =
          signRequest.geolocation || (await this.getCurrentLocation());
        const payload = {
          person_id: signRequest.person_id,
          image_base64: imageBase64,
          document_hash: signRequest.document_hash,
          safemetrics_form_id: signRequest.safemetrics_form_id,
          geolocation: geolocation,
          client_metadata: {
            ...clientMetadata,
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            screen_resolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        };
        // Emitir progreso de procesamiento
        this.emitEvent("sign-request-progress", { status: "processing" });
        const startTime = performance.now();
        const response = await this.makeRequest("/api/sign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        const responseTime = performance.now() - startTime;
        // Emitir evento de respuesta del servidor
        this.emitEvent("sign-response", {
          success: response.ok,
          signature_id: result.signature_id,
          http_status: response.status,
          message:
            result.message ||
            (response.ok ? "Firma procesada" : "Error en firma"),
          response_time_ms: Math.round(responseTime),
        });
        if (!response.ok) {
          throw new Error(
            result.detail?.message || result.message || "Error en firma"
          );
        }
        // Generar QR PNG si la firma fue exitosa
        let qrPng = "";
        if (result.success && result.qr_url) {
          try {
            qrPng = await QRService.generateSignatureQR(
              result.qr_url,
              result.signature_id,
              256
            );
          } catch (qrError) {
            console.warn("Error generando QR, continuando sin QR:", qrError);
          }
        }
        return {
          success: result.success,
          signature_id: result.signature_id,
          person_id: result.person_id,
          person_name: result.person_name,
          confidence_score: result.confidence_score,
          qr_url: result.qr_url,
          qr_png: qrPng,
          certificate: result.certificate,
          message: result.message,
          timestamp: result.timestamp,
        };
      } catch (error) {
        console.error("Error en firma de documento:", error);
        return {
          success: false,
          message:
            error instanceof Error ? error.message : "Error procesando firma",
          timestamp: new Date().toISOString(),
        };
      }
    }
    /**
     * Verifica el estado de una firma
     */
    async verifySignature(signatureId) {
      try {
        const response = await this.makeRequest(
          `/api/signature/${signatureId}/verify`,
          {
            method: "GET",
          }
        );
        return await response.json();
      } catch (error) {
        console.error("Error verificando firma:", error);
        throw error;
      }
    }
    /**
     * Realiza petición HTTP con reintentos
     */
    async makeRequest(endpoint, options) {
      const url = `${this.apiBaseUrl}${endpoint}`;
      let lastError;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          console.log(
            `🌐 Intento ${attempt + 1}/${this.retries + 1} para ${endpoint} - Timeout: 240000ms`
          );
          // Emitir evento de progreso de validación si es un endpoint de validación
          if (endpoint === "/validate_identity") {
            this.emitEvent("sign-validation-progress", {
              status: "validating",
              attempt: attempt + 1,
              max_attempts: this.retries + 1,
            });
          }
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 240000);
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error("Error desconocido");
          // Emitir eventos específicos de error
          if (lastError.name === "AbortError") {
            this.emitEvent("sign-timeout-error", {
              timeout_ms: 240000,
              endpoint: endpoint,
              attempt: attempt + 1,
            });
          } else {
            this.emitEvent("sign-network-error", {
              error: lastError.message,
              retry_attempt: attempt + 1,
              max_retries: this.retries + 1,
            });
          }
          if (attempt < this.retries) {
            // Esperar antes del siguiente intento (backoff exponencial)
            await new Promise((resolve) =>
              setTimeout(resolve, Math.pow(2, attempt) * 1000)
            );
          }
        }
      }
      throw lastError;
    }
    /**
     * Obtiene la ubicación actual del usuario
     */
    async getCurrentLocation() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(undefined);
          return;
        }
        const timeout = setTimeout(() => {
          resolve(undefined);
        }, 5000); // 5 segundos timeout
        navigator.geolocation.getCurrentPosition(
          (position) => {
            clearTimeout(timeout);
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (error) => {
            clearTimeout(timeout);
            console.warn("Error obteniendo ubicación:", error);
            resolve(undefined);
          },
          {
            timeout: 5000,
            enableHighAccuracy: false,
            maximumAge: 300000, // 5 minutos
          }
        );
      });
    }
    /**
     * Configura la URL base de la API
     */
    setApiBaseUrl(url) {
      this.apiBaseUrl = url;
    }
    /**
     * Obtiene información del estado del servicio
     */
    async getServiceHealth() {
      try {
        const response = await this.makeRequest("/health", {
          method: "GET",
        });
        return await response.json();
      } catch (error) {
        console.error("Error verificando salud del servicio:", error);
        throw error;
      }
    }
  }

  /**
   * UIRenderer - Genera el HTML y CSS del componente SfiFacial
   *
   * Responsabilidades:
   * - Generar el template HTML completo
   * - Incluir todos los estilos CSS
   * - Proporcionar estructura para las fases
   */
  class UIRenderer {
    /**
     * Genera el HTML completo del componente
     */
    static render() {
      return `
      <style>
        ${this.getStyles()}
      </style>

      ${this.getHTML()}
    `;
    }
    /**
     * Obtiene todos los estilos CSS
     */
    static getStyles() {
      return `
        :host {
          display: inline-block;
          position: relative;
        }

        .sfi-container {
          position: relative;
          display: inline-block;
        }

        .sfi-video {
          width: 100%;
          max-width: 640px;
          height: auto;
          aspect-ratio: 4/3;
          border-radius: 12px;
          object-fit: cover;
          background: #000;
          display: none;
        }

        .sfi-canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          border-radius: 12px;
          display: none;
        }

        ${this.getResponsiveStyles()}

        ${this.getButtonStyles()}

        ${this.getLivenessStyles()}

        ${this.getModalStyles()}

        ${this.getPhaseStyles()}
      `;
    }
    /**
     * Obtiene los estilos responsive
     */
    static getResponsiveStyles() {
      return `
        @media (max-width: 768px) {
          .sfi-video {
            border-radius: 8px;
            max-width: 100%;
          }

          .sfi-canvas {
            border-radius: 8px;
          }

          .liveness-status {
            position: static !important;
            margin: 12px auto;
            max-width: 100%;
            min-width: auto;
            padding: 10px;
            border-radius: 8px;
          }
          
          .liveness-info {
            font-size: 13px;
            padding: 8px 10px;
            margin-bottom: 10px;
          }

          .gesture-indicator {
            padding: 5px 8px;
            gap: 6px;
            margin-bottom: 6px;
          }
          
          .gesture-status {
            width: 14px;
            height: 14px;
          }
          
          .gesture-text {
            font-size: 12px;
          }
          
          .countdown {
            font-size: 18px;
            margin: 6px 0;
          }
          
          .instruction-text {
            font-size: 13px;
            margin-top: 6px;
          }

          .phase-container {
            margin: 8px 0;
            padding: 0 10px;
          }
        }

        @media (max-width: 480px) {
          .sfi-video {
            border-radius: 6px;
          }

          .sfi-canvas {
            border-radius: 6px;
          }

          .liveness-status {
            width: 100%;
            padding: 8px;
            border-radius: 6px;
          }
          
          .gesture-indicator {
            padding: 4px 6px;
            gap: 5px;
            margin-bottom: 5px;
            border-radius: 4px;
          }
          
          .gesture-status {
            width: 12px;
            height: 12px;
          }
          
          .gesture-text {
            font-size: 11px;
          }
          
          .countdown {
            font-size: 16px;
            margin: 5px 0;
          }
          
          .instruction-text {
            font-size: 12px;
            margin-top: 5px;
            padding: 0 5px;
          }
          
          .liveness-info {
            font-size: 12px;
            padding: 6px 8px;
            margin-bottom: 8px;
          }

          .phase-container {
            margin: 5px 0;
            padding: 0 8px;
          }
        }
      `;
    }
    /**
     * Obtiene los estilos de botones
     */
    static getButtonStyles() {
      return `
        button {
          border: none;
          border-radius: var(--sfi-button-border-radius, 8px);
          padding: var(--sfi-button-padding, 14px 28px);
          font-family: inherit;
          font-size: var(--sfi-button-font-size, 16px);
          font-weight: var(--sfi-button-font-weight, 600);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: all 0.3s ease;
          background: var(--sfi-button-bg, linear-gradient(135deg, #1E88C7 0%, #2E3B72 100%));
          color: var(--sfi-button-text-color, white);
          min-height: 48px;
          margin: 10px auto;
          box-shadow: var(--sfi-button-box-shadow, 0 4px 12px rgba(30, 136, 199, 0.25));
        }

        button:hover:not(:disabled) {
          transform: var(--sfi-button-hover-transform, translateY(-2px));
          box-shadow: var(--sfi-button-hover-box-shadow, 0 6px 20px rgba(30, 136, 199, 0.4));
          background: linear-gradient(135deg, #2E3B72 0%, #1E88C7 100%);
        }

        button:active:not(:disabled) {
          transform: translateY(0);
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
      `;
    }
    /**
     * Obtiene los estilos de liveness
     */
    static getLivenessStyles() {
      return `
        .liveness-status {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(46, 59, 114, 0.95);
          color: white;
          padding: 12px;
          border-radius: 10px;
          min-width: 180px;
          max-width: 220px;
          z-index: 100;
          border: 2px solid rgba(30, 136, 199, 0.3);
        }

        .gesture-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          padding: 6px;
          border-radius: 6px;
          background: rgba(30, 136, 199, 0.15);
        }

        .gesture-status {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          flex-shrink: 0;
        }

        .gesture-status.completed {
          background: #10b981;
          border-color: #10b981;
        }

        .gesture-status.current {
          background: #1E88C7;
          border-color: #1E88C7;
          animation: pulse 1.5s infinite;
        }

        .gesture-status.pending {
          background: rgba(255, 255, 255, 0.2);
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .gesture-text {
          font-size: 12px;
          font-weight: 500;
        }

        .countdown {
          text-align: center;
          font-size: 20px;
          font-weight: bold;
          color: #1E88C7;
          margin: 8px 0;
        }

        .instruction-text {
          text-align: center;
          font-size: 14px;
          color: white;
          margin-top: 8px;
        }

        .liveness-info {
          background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
          border: 2px solid #1E88C7;
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 12px;
          color: #2E3B72;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 2px 8px rgba(30, 136, 199, 0.15);
        }
      `;
    }
    /**
     * Obtiene los estilos de modales
     */
    static getModalStyles() {
      return `
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(46, 59, 114, 0.85);
          backdrop-filter: blur(4px);
          display: none;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        .modal-overlay.show {
          display: flex;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal {
          background: #ffffff;
          border-radius: 12px;
          padding: 0;
          width: 90%;
          max-width: 480px;
          box-shadow: 
            0 20px 25px -5px rgba(0, 0, 0, 0.1),
            0 10px 10px -5px rgba(0, 0, 0, 0.04);
          position: relative;
          animation: slideUp 0.3s ease;
          overflow: hidden;
          border: 3px solid #1E88C7;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-header {
          background: linear-gradient(135deg, #2E3B72 0%, #1E88C7 100%);
          padding: 28px 32px;
          margin-bottom: 0;
          position: relative;
        }

        .modal-title {
          font-size: 22px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }

        .modal-subtitle {
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          font-weight: 400;
          line-height: 1.5;
        }

        #registration-form,
        #validation-form {
          padding: 32px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group:last-of-type {
          margin-bottom: 0;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #2E3B72;
          letter-spacing: -0.01em;
        }

        .form-group label:has(+ input[required])::after {
          content: ' *';
          color: #dc2626;
          font-weight: 600;
        }

        .form-group input {
          width: 100%;
          padding: 13px 16px;
          border: 2px solid #cbd5e1;
          border-radius: 8px;
          font-size: 15px;
          font-family: inherit;
          transition: all 0.2s ease;
          background: #ffffff;
          color: #0f172a;
          box-sizing: border-box;
        }

        .form-group input::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }

        .form-group input:focus {
          outline: none;
          border-color: #1E88C7;
          box-shadow: 0 0 0 3px rgba(30, 136, 199, 0.15);
          background: #ffffff;
        }

        .form-group input.required {
          border-color: #dc2626;
          background: #fef2f2;
        }

        .form-group input.valid {
          border-color: #059669;
          background: #f0fdf4;
        }

        .form-group input:disabled {
          background: #f1f5f9;
          color: #64748b;
          cursor: not-allowed;
        }

        .error-message {
          color: #dc2626;
          font-size: 13px;
          margin-top: 6px;
          display: none;
          font-weight: 500;
          letter-spacing: -0.01em;
        }

        .error-message.show {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .error-message::before {
          content: '⚠';
          font-size: 14px;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e2e8f0;
        }

        .btn {
          flex: 1;
          padding: 13px 24px;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: inherit;
          letter-spacing: -0.01em;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #1E88C7 0%, #2E3B72 100%);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(30, 136, 199, 0.25);
        }

        .btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #2E3B72 0%, #1E88C7 100%);
          box-shadow: 0 6px 16px rgba(30, 136, 199, 0.4);
          transform: translateY(-2px);
        }

        .btn-primary:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(30, 136, 199, 0.25);
        }

        .btn-secondary {
          background: #ffffff;
          color: #2E3B72;
          border: 2px solid #cbd5e1;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #1E88C7;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }

        .btn-secondary:active:not(:disabled) {
          transform: translateY(0);
          background: #f1f5f9;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        .close-btn {
          position: absolute;
          top: 22px;
          right: 26px;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #ffffff;
          padding: 4px;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s ease;
          line-height: 1;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.05);
        }

        .close-btn:active {
          transform: scale(0.95);
        }

        .btn.loading {
          pointer-events: none;
          opacity: 0.7;
        }

        .btn.loading::after {
          content: '';
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid currentColor;
          border-right-color: transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 640px) {
          .modal {
            width: 95%;
            max-width: none;
            margin: 20px;
          }

          .modal-header {
            padding: 22px 26px;
          }

          #registration-form,
          #validation-form {
            padding: 26px;
          }

          .form-actions {
            flex-direction: column-reverse;
          }

          .btn {
            width: 100%;
          }
        }
      `;
    }
    /**
     * Obtiene los estilos de las fases
     */
    static getPhaseStyles() {
      return `
        .phase-container {
          text-align: center;
          margin: 10px 0;
          max-width: 600px;
          margin: 0 auto;
        }

        .alert-box {
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border: 2px solid #1E88C7;
          border-radius: 16px;
          padding: 28px;
          max-width: 520px;
          margin: 0 auto;
          box-shadow: 0 8px 20px rgba(30, 136, 199, 0.15);
        }

        .alert-icon {
          font-size: 52px;
          text-align: center;
          margin-bottom: 18px;
        }

        .alert-title {
          font-size: 22px;
          font-weight: 700;
          color: #2E3B72;
          text-align: center;
          margin-bottom: 18px;
        }

        .alert-content {
          color: #334155;
          line-height: 1.7;
          text-align: left;
          font-size: 15px;
        }

        .alert-content ul {
          margin: 14px 0;
          padding-left: 24px;
        }

        .alert-button {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          margin-top: 24px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
        }

        .alert-button:hover {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
        }

        .input-box {
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border: 2px solid #1E88C7;
          border-radius: 16px;
          padding: 28px;
          max-width: 420px;
          margin: 0 auto;
          box-shadow: 0 8px 20px rgba(30, 136, 199, 0.15);
        }

        .input-icon {
          font-size: 52px;
          text-align: center;
          margin-bottom: 18px;
        }

        .input-title {
          font-size: 22px;
          font-weight: 700;
          color: #2E3B72;
          text-align: center;
          margin-bottom: 22px;
        }

        .input-field {
          width: 100%;
          padding: 13px 16px;
          border: 2px solid #cbd5e1;
          border-radius: 8px;
          font-size: 16px;
          margin-bottom: 18px;
          box-sizing: border-box;
          transition: all 0.2s ease;
        }

        .input-field:focus {
          outline: none;
          border-color: #1E88C7;
          box-shadow: 0 0 0 3px rgba(30, 136, 199, 0.15);
        }

        .input-button {
          background: linear-gradient(135deg, #1E88C7 0%, #2E3B72 100%);
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(30, 136, 199, 0.25);
        }

        .input-button:hover {
          background: linear-gradient(135deg, #2E3B72 0%, #1E88C7 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(30, 136, 199, 0.4);
        }

        .success-box {
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
          border: 2px solid #10b981;
          border-radius: 16px;
          padding: 28px;
          text-align: center;
          margin: 20px 0;
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.15);
        }

        .success-icon {
          font-size: 52px;
          color: #059669;
          margin-bottom: 14px;
        }

        .success-message {
          color: #065f46;
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 10px;
        }

        .success-subtitle {
          color: #047857;
          font-size: 15px;
        }

        .error-box {
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          border: 2px solid #ef4444;
          border-radius: 16px;
          padding: 28px;
          text-align: center;
          margin: 20px 0;
          box-shadow: 0 8px 20px rgba(239, 68, 68, 0.15);
        }

        .error-icon {
          font-size: 52px;
          color: #dc2626;
          margin-bottom: 14px;
        }

        .error-box .error-message {
          color: #991b1b;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 18px;
          display: block;
        }

        .capture-button {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          padding: 16px 36px;
          border-radius: 8px;
          font-size: 18px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
        }

        .capture-button:hover {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
        }

        .processing-box {
          background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
          border: 2px solid #1E88C7;
          border-radius: 16px;
          padding: 44px 24px;
          text-align: center;
          margin: 20px 0;
          box-shadow: 0 8px 20px rgba(30, 136, 199, 0.15);
        }

        .spinner {
          border: 4px solid #e5e7eb;
          border-top: 4px solid #1E88C7;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          animation: spin 1s linear infinite;
          margin: 0 auto 18px;
        }

        .processing-message {
          color: #2E3B72;
          font-size: 18px;
          font-weight: 600;
        }

        .complete-box {
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
          border: 2px solid #10b981;
          border-radius: 16px;
          padding: 36px 28px;
          text-align: center;
          margin: 20px 0;
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.15);
        }

        .complete-icon {
          font-size: 68px;
          margin-bottom: 18px;
        }

        .complete-message {
          color: #065f46;
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 18px;
        }

        .reset-button {
          background: linear-gradient(135deg, #64748b 0%, #475569 100%);
          color: white;
          border: none;
          padding: 13px 28px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(100, 116, 139, 0.25);
        }

        .reset-button:hover {
          background: linear-gradient(135deg, #475569 0%, #334155 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(100, 116, 139, 0.4);
        }
      `;
    }
    /**
     * Obtiene el HTML completo
     */
    static getHTML() {
      return `
      <div class="sfi-container">
        <video class="sfi-video" id="sfi-video" autoplay muted playsinline style="display: none;"></video>
        <canvas class="sfi-canvas" id="sfi-canvas" width="640" height="480" style="display: none;"></canvas>
      </div>

      <div class="phase-container" id="phase-button">
        <button id="register-btn">
          👤➕ Registrar Personal
        </button>
      </div>

      <div class="phase-container" id="phase-liveness-alert" style="display: none;">
        <div class="alert-box">
          <div class="alert-icon">🤖</div>
          <div class="alert-title">Verificación de Persona Real</div>
          <div class="alert-content">
            <p>Para garantizar la seguridad, debe pasar por una prueba que verifica que es una persona real.</p>
            <p>Se le pedirá realizar <strong>3 gestos</strong> sencillos:</p>
            <ul>
              <li>🟢 Parpadear varias veces</li>
              <li>😊 Sonreír ampliamente</li>
              <li>😮 Abrir la boca</li>
            </ul>
            <p><strong>Importante:</strong> Mantenga buena iluminación y posición frontal frente a la cámara.</p>
          </div>
          <button class="alert-button" id="liveness-alert-ok">
            ✓ Entendido, Comenzar Verificación
          </button>
        </div>
      </div>

      <div class="phase-container" id="phase-identity-input" style="display: none;">
        <div class="input-box">
          <div class="input-icon">🆔</div>
          <div class="input-title">Identificación</div>
          <input 
            type="text" 
            id="identity-input" 
            class="input-field" 
            placeholder="Ingrese su número de identificación"
          >
          <button class="input-button" id="identity-submit">
            Continuar con Verificación
          </button>
        </div>
      </div>

      <div class="phase-container" id="phase-liveness" style="display: none;">
        <div class="liveness-status" id="liveness-status-main">
          <div class="gesture-indicator" id="blink-indicator-main">
            <div class="gesture-status pending" id="blink-status-main"></div>
            <span class="gesture-text">Parpadeo</span>
          </div>
          <div class="gesture-indicator" id="smile-indicator-main">
            <div class="gesture-status pending" id="smile-status-main"></div>
            <span class="gesture-text">Sonrisa</span>
          </div>
          <div class="gesture-indicator" id="head-rotation-indicator-main">
            <div class="gesture-status pending" id="head-rotation-status-main"></div>
            <span class="gesture-text">Movimiento de Cabeza</span>
          </div>
          <div class="countdown" id="countdown-main" style="display: none;"></div>
          <div class="instruction-text" id="instruction-text-main">Esperando inicio...</div>
        </div>
      </div>

      <div class="phase-container" id="phase-capture" style="display: none;">
        <div class="success-box">
          <div class="success-icon">✅</div>
          <div class="success-message">Verificación Completada Exitosamente</div>
          <div class="success-subtitle">Ya puede tomar la foto</div>
        </div>
        <button class="capture-button" id="capture-btn">
          📸 Tomar Foto y Procesar
        </button>
      </div>

      <div class="phase-container" id="phase-processing" style="display: none;">
        <div class="processing-box">
          <div class="spinner"></div>
          <div class="processing-message">Procesando...</div>
        </div>
      </div>

      <div class="phase-container" id="phase-error" style="display: none;">
        <div class="error-box">
          <div class="error-icon">❌</div>
          <div class="error-message" id="error-message">Ha ocurrido un error</div>
        </div>
      </div>

      <div class="phase-container" id="phase-complete" style="display: none;">
        <div class="complete-box">
          <div class="complete-icon">🎉</div>
          <div class="complete-message" id="complete-message">Operación Completada</div>
          <button class="reset-button" id="reset-btn">🔄 Nuevo Proceso</button>
        </div>
      </div>

      <div class="modal-overlay" id="modal-overlay">
        <div class="modal" id="modal">
          <button class="close-btn" id="close-btn" aria-label="Cerrar modal">&times;</button>
          
          <div class="modal-header">
            <div class="modal-title" id="modal-title">Registro de Personal</div>
            <div class="modal-subtitle" id="modal-subtitle">Complete la información requerida para el registro biométrico</div>
          </div>

          <form id="registration-form" autocomplete="on">
            <div class="form-group">
              <label for="name-input">Nombre Completo</label>
              <input 
                type="text" 
                id="name-input" 
                name="fullname"
                placeholder="Ej: Juan Pérez García"
                required
                autocomplete="name"
                maxlength="100"
              >
              <div class="error-message" id="name-error">Este campo es obligatorio</div>
            </div>

            <div class="form-group">
              <label for="email-input">Correo Electrónico Corporativo</label>
              <input 
                type="email" 
                id="email-input" 
                name="email"
                placeholder="nombre@empresa.com"
                autocomplete="email"
                maxlength="100"
              >
              <div class="error-message" id="email-error">Ingrese un correo electrónico válido</div>
            </div>

            <div class="form-group">
              <label for="id-input">Número de Identificación</label>
              <input 
                type="text" 
                id="id-input" 
                name="employee-id"
                placeholder="Ej: 105552564412"
                required
                autocomplete="username"
                maxlength="50"
              >
              <div class="error-message" id="id-error">Este campo es obligatorio</div>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="cancel-btn">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" id="submit-btn">
                Continuar
              </button>
            </div>
          </form>

          <form id="validation-form" style="display: none;" autocomplete="on">
            <div class="form-group">
              <label for="validate-id-input">Número de Identificación</label>
              <input 
                type="text" 
                id="validate-id-input" 
                name="validation-id"
                placeholder="Ingrese su número de identificación"
                required
                autocomplete="username"
                maxlength="50"
              >
              <div class="error-message" id="validate-id-error">Este campo es obligatorio</div>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="validate-cancel-btn">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" id="validate-submit-btn">
                Buscar y Validar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    }
  }

  /**
   * PhaseManager - Gestiona las fases del componente SfiFacial
   *
   * Responsabilidades:
   * - Gestionar transiciones entre fases
   * - Limpiar recursos de fases anteriores
   * - Emitir eventos de cambio de fase
   */
  class PhaseManager {
    constructor(phaseContainers, phaseElements, callbacks) {
      this.currentPhase = "button";
      this.phaseContainers = phaseContainers;
      this.phaseElements = phaseElements;
      this.callbacks = callbacks;
    }
    /**
     * Obtiene la fase actual
     */
    getCurrentPhase() {
      return this.currentPhase;
    }
    /**
     * Cambia a una nueva fase
     */
    changePhase(newPhase) {
      const previousPhase = this.currentPhase;
      console.log(`🎯 Cambiando fase de '${previousPhase}' a '${newPhase}'`);
      // Limpiar fase anterior
      this.cleanupCurrentPhase();
      // Cambiar fase
      this.currentPhase = newPhase;
      // Mostrar nueva fase
      this.showPhase(newPhase);
      // Emitir evento
      if (this.callbacks.emitEvent) {
        this.callbacks.emitEvent("phase-changed", {
          phase: newPhase,
          previousPhase: previousPhase,
          timestamp: Date.now(),
        });
      }
      // Callback de cambio de fase
      if (this.callbacks.onPhaseChange) {
        this.callbacks.onPhaseChange(newPhase, previousPhase);
      }
    }
    /**
     * Limpia los recursos de la fase actual
     */
    cleanupCurrentPhase() {
      console.log(`🧹 Limpiando fase actual: ${this.currentPhase}`);
      // Ocultar todos los contenedores de fases
      Object.values(this.phaseContainers).forEach((container) => {
        if (container) container.style.display = "none";
      });
      // Limpieza específica según fase actual
      switch (this.currentPhase) {
        case "liveness":
          console.log("🧹 Limpieza: Fase de liveness anterior");
          break;
        case "identity_input":
          // Limpiar input
          if (this.phaseElements.identityInput) {
            this.phaseElements.identityInput.value = "";
          }
          break;
      }
    }
    /**
     * Muestra una fase específica
     */
    showPhase(phase) {
      const container = this.phaseContainers[phase];
      if (!container) {
        console.error(`❌ Contenedor de fase '${phase}' no encontrado`);
        return;
      }
      // Mostrar contenedor
      container.style.display = "block";
      // Configuración específica por fase
      switch (phase) {
        case "button":
          if (this.callbacks.updateButton) {
            this.callbacks.updateButton();
          }
          // Ocultar video y canvas cuando se vuelva al botón inicial
          // (esto se maneja en el componente principal)
          break;
        case "liveness":
          // Iniciar cámara automáticamente
          console.log("🎯 Fase liveness: Iniciando cámara...");
          if (this.callbacks.onLivenessPhase) {
            setTimeout(() => this.callbacks.onLivenessPhase(), 500);
          }
          break;
        case "capture":
          console.log(
            "📸 Fase capture: Manteniendo cámara activa para captura"
          );
          if (this.callbacks.onCapturePhase) {
            this.callbacks.onCapturePhase();
          }
          break;
        case "processing":
          console.log(
            "⚙️ Fase processing: Manteniendo cámara activa para procesamiento"
          );
          if (this.callbacks.onProcessingPhase) {
            this.callbacks.onProcessingPhase();
          }
          break;
        case "error":
          console.log("❌ Fase error: Deteniendo cámara por error");
          if (this.callbacks.stopCamera) {
            this.callbacks.stopCamera();
          }
          if (this.callbacks.onErrorPhase) {
            this.callbacks.onErrorPhase();
          }
          break;
        case "complete":
          console.log(
            "🔄 Fase complete: Deteniendo cámara después de captura exitosa"
          );
          if (this.callbacks.stopCamera) {
            this.callbacks.stopCamera();
          }
          if (this.callbacks.onCompletePhase) {
            this.callbacks.onCompletePhase();
          }
          break;
      }
    }
    /**
     * Resetea a la fase inicial
     */
    resetToInitial() {
      this.changePhase("button");
    }
  }

  /**
   * CameraManager - Gestiona la cámara y el canvas
   *
   * Responsabilidades:
   * - Inicializar y configurar elementos de video y canvas
   * - Iniciar y detener la cámara
   * - Capturar fotos de alta calidad
   * - Gestionar el renderizado de la malla facial
   */
  class CameraManager {
    constructor(cameraService, shadowRoot, callbacks = {}) {
      this.videoElement = null;
      this.canvasElement = null;
      this.canvasContext = null;
      this.shadowRoot = null;
      this.renderingInterval = null;
      this.processingInterval = null;
      this.cameraService = cameraService;
      this.shadowRoot = shadowRoot;
      this.callbacks = callbacks;
    }
    /**
     * Inicializa los elementos de video y canvas
     */
    initializeVideoAndCanvas() {
      try {
        console.log("🔄 Reinicializando elementos de video y canvas...");
        // Reinicializar video element
        if (!this.videoElement) {
          this.videoElement = this.shadowRoot?.querySelector(".sfi-video");
          if (!this.videoElement) {
            console.error(
              "❌ No se pudo encontrar elemento de video en shadowRoot"
            );
            return;
          }
          console.log("✅ Video element reinicializado");
          console.log("🔍 Video element ID:", this.videoElement.id);
          console.log(
            "🔍 Video element srcObject al inicializar:",
            this.videoElement.srcObject
          );
        } else {
          console.log("⚠️ Video element ya existe, no reinicializando");
          console.log(
            "🔍 Video element existente srcObject:",
            this.videoElement.srcObject
          );
        }
        // Reinicializar canvas element
        if (!this.canvasElement) {
          this.canvasElement = this.shadowRoot?.querySelector(".sfi-canvas");
          if (!this.canvasElement) {
            console.error(
              "❌ No se pudo encontrar elemento de canvas en shadowRoot"
            );
            return;
          }
          // Configurar canvas
          this.canvasElement.width = 640;
          this.canvasElement.height = 480;
          console.log("✅ Canvas element reinicializado");
        }
        // Reinicializar canvas context
        if (!this.canvasContext) {
          this.canvasContext = this.canvasElement.getContext("2d");
          if (!this.canvasContext) {
            console.error("❌ No se pudo obtener contexto 2D del canvas");
            return;
          }
          console.log("✅ Canvas context reinicializado");
        }
        console.log("✅ Todos los elementos de video y canvas reinicializados");
      } catch (error) {
        console.error(
          "❌ Error reinicializando elementos de video y canvas:",
          error
        );
      }
    }
    /**
     * Configura e inicia la cámara
     */
    async setupCamera(videoElement) {
      try {
        console.log("📹 Configurando cámara...");
        // Reinicializar elementos si es necesario
        if (!this.videoElement || !this.canvasElement) {
          console.log("🔄 Reinicializando elementos de video y canvas...");
          this.initializeVideoAndCanvas();
        }
        // Usar el video interno del componente si no se proporciona uno externo
        const targetVideo = videoElement || this.videoElement;
        if (!targetVideo) {
          if (this.callbacks.emitError) {
            this.callbacks.emitError(
              "CAMERA_ERROR",
              "No video element available"
            );
          }
          return false;
        }
        this.videoElement = targetVideo;
        const result = await this.cameraService.startCamera(targetVideo);
        if (!result.success) {
          if (this.callbacks.emitError) {
            this.callbacks.emitError(
              "CAMERA_ERROR",
              result.error || "Error al iniciar cámara"
            );
          }
          return false;
        }
        // Mostrar video y canvas
        if (this.videoElement) {
          this.videoElement.style.display = "block";
          console.log("✅ Video mostrado");
        }
        if (this.canvasElement) {
          this.canvasElement.style.display = "block";
          console.log("✅ Canvas mostrado");
        }
        // Callback de cámara iniciada
        if (this.callbacks.onCameraStarted) {
          this.callbacks.onCameraStarted();
        }
        console.log("✅ Cámara configurada exitosamente");
        return true;
      } catch (error) {
        if (this.callbacks.emitError) {
          this.callbacks.emitError(
            "CAMERA_ERROR",
            error instanceof Error ? error.message : "Error de cámara"
          );
        }
        if (this.callbacks.onError) {
          this.callbacks.onError(
            error instanceof Error ? error : new Error("Error de cámara")
          );
        }
        return false;
      }
    }
    /**
     * Detiene la cámara y limpia los recursos
     */
    stopCamera() {
      this.stopProcessing();
      // Ocultar video y canvas antes de limpiarlos
      if (this.videoElement) {
        this.videoElement.style.display = "none";
        this.videoElement.pause();
        this.videoElement.srcObject = null;
        this.videoElement = null;
      }
      if (this.canvasElement) {
        this.canvasElement.style.display = "none";
        this.canvasElement.width = 0;
        this.canvasElement.height = 0;
        this.canvasElement = null;
      }
      if (this.canvasContext) {
        this.canvasContext = null;
      }
      // Detener servicios de cámara
      this.cameraService.stopCamera();
      // Callback de cámara detenida
      if (this.callbacks.onCameraStopped) {
        this.callbacks.onCameraStopped();
      }
      console.log("📹 Cámara detenida y elementos limpiados");
    }
    /**
     * Detiene el procesamiento
     */
    stopProcessing() {
      if (this.processingInterval !== null) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }
      if (this.renderingInterval !== null) {
        clearInterval(this.renderingInterval);
        this.renderingInterval = null;
      }
    }
    /**
     * Captura una foto de alta calidad del video
     */
    captureHighQualityPhoto() {
      if (!this.videoElement || !this.canvasElement) {
        console.error(
          "❌ No se puede capturar foto: elementos de video/canvas no disponibles"
        );
        return null;
      }
      // Verificar que el video esté listo (readyState >= 2 es suficiente para capturar)
      // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
      if (this.videoElement.readyState < 2) {
        console.error(
          "❌ No se puede capturar foto: video no tiene datos suficientes (readyState:",
          this.videoElement.readyState,
          ")"
        );
        return null;
      }
      // Verificar que el video tenga dimensiones válidas
      if (!this.videoElement.videoWidth || !this.videoElement.videoHeight) {
        console.error(
          "❌ No se puede capturar foto: video no tiene dimensiones válidas"
        );
        return null;
      }
      try {
        const canvas = this.canvasElement;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("❌ No se puede obtener contexto 2D del canvas");
          return null;
        }
        // Usar dimensiones reales del video
        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;
        if (
          !videoWidth ||
          !videoHeight ||
          videoWidth < 200 ||
          videoHeight < 200
        ) {
          console.error(
            `❌ Dimensiones de video insuficientes: ${videoWidth}x${videoHeight}`
          );
          return null;
        }
        // Configurar canvas con dimensiones exactas
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        // Limpiar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Dibujar frame actual
        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
        // Convertir a base64
        const imageData = canvas.toDataURL("image/jpeg", 0.95);
        const photoData = {
          data: imageData,
          width: videoWidth,
          height: videoHeight,
          timestamp: Date.now(),
        };
        // Callback de foto capturada
        if (this.callbacks.onPhotoCaptured) {
          this.callbacks.onPhotoCaptured(photoData);
        }
        console.log(`✅ Foto capturada: ${videoWidth}x${videoHeight}`);
        return photoData;
      } catch (error) {
        console.error("❌ Error capturando foto:", error);
        if (this.callbacks.onError) {
          this.callbacks.onError(
            error instanceof Error ? error : new Error("Error capturando foto")
          );
        }
        return null;
      }
    }
    /**
     * Inicia el renderizado automático de la malla facial
     */
    startAutomaticRendering(drawFacialMesh, getLandmarks, interval = 150) {
      console.log("🎬 Iniciando renderizado automático...");
      if (this.renderingInterval) {
        clearInterval(this.renderingInterval);
      }
      this.renderingInterval = window.setInterval(() => {
        try {
          const landmarks = getLandmarks();
          if (landmarks.length > 0 && this.canvasElement) {
            // Verificar que el canvas esté configurado correctamente
            if (
              this.canvasElement.width === 0 ||
              this.canvasElement.height === 0
            ) {
              this.canvasElement.width = 640;
              this.canvasElement.height = 480;
            }
            // Obtener los landmarks del primer rostro
            const faceLandmarks = Array.isArray(landmarks[0])
              ? landmarks[0]
              : landmarks;
            // Dibujar malla facial
            drawFacialMesh(this.canvasElement, faceLandmarks);
          }
        } catch (error) {
          console.warn("Error en renderizado automático:", error);
        }
      }, interval);
    }
    /**
     * Obtiene el elemento de video
     */
    getVideoElement() {
      return this.videoElement;
    }
    /**
     * Obtiene el elemento de canvas
     */
    getCanvasElement() {
      return this.canvasElement;
    }
    /**
     * Obtiene el contexto del canvas
     */
    getCanvasContext() {
      return this.canvasContext;
    }
    /**
     * Actualiza el shadow root
     */
    updateShadowRoot(shadowRoot) {
      this.shadowRoot = shadowRoot;
    }
  }

  /**
   * APIHandler - Maneja todas las comunicaciones con la API
   *
   * Responsabilidades:
   * - Realizar peticiones HTTP con timeout y manejo de errores
   * - Health checks de la API
   * - Validación de imágenes antes de enviar
   * - Reintentos automáticos con backoff exponencial
   */
  class APIHandler {
    constructor(config) {
      this.apiBaseUrl = config.apiBaseUrl;
      this.apiTimeout = config.apiTimeout;
    }
    /**
     * Actualiza la configuración de la API
     */
    updateConfig(config) {
      if (config.apiBaseUrl) {
        this.apiBaseUrl = config.apiBaseUrl;
      }
      if (config.apiTimeout !== undefined) {
        this.apiTimeout = config.apiTimeout;
      }
    }
    /**
     * Realiza una petición HTTP con timeout y manejo de errores
     */
    async makeRequest(url, options = {}) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.apiTimeout);
      try {
        console.log(`🌐 Haciendo petición a: ${url}`);
        console.log(`⏱️ Timeout configurado: ${this.apiTimeout}ms`);
        // Verificar conectividad antes de hacer la petición
        if (!navigator.onLine) {
          throw new Error(
            "🌐 Sin conexión a internet. Verifica tu conexión de red."
          );
        }
        // Intentar conectar primero para verificar que la API esté disponible
        try {
          const testResponse = await fetch(`${this.apiBaseUrl}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000), // 5 segundos para health check
          });
          if (!testResponse.ok) {
            throw new Error(
              `🔍 API no responde correctamente (${testResponse.status})`
            );
          }
          console.log("✅ Health check exitoso, API está disponible");
        } catch (healthError) {
          console.warn(
            "⚠️ Health check falló, pero continuando con la petición principal:",
            healthError
          );
        }
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          if (response.status >= 500) {
            throw new Error(
              `Error del servidor (${response.status}): ${response.statusText}`
            );
          } else if (response.status === 404) {
            throw new Error(
              `Endpoint no encontrado (${response.status}): Verifica la URL de la API`
            );
          } else if (response.status === 401 || response.status === 403) {
            throw new Error(
              `Error de autenticación (${response.status}): ${response.statusText}`
            );
          } else {
            throw new Error(
              `Error en la API (${response.status}): ${response.statusText}`
            );
          }
        }
        console.log(`✅ Respuesta exitosa de API: ${response.status}`);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            throw new Error(
              `⏱️ Timeout: La API no respondió en ${this.apiTimeout / 1000} segundos. Verifica la conexión y que la API esté ejecutándose.`
            );
          } else if (error.message.includes("fetch")) {
            throw new Error(
              `🌐 Error de conexión: No se puede conectar con la API en ${url}. Verifica que esté activa y accesible.`
            );
          } else if (error.message.includes("Failed to fetch")) {
            throw new Error(
              `🌐 Error de red: No se puede alcanzar la API. Verifica la URL y que el servidor esté ejecutándose.`
            );
          }
        }
        throw error;
      }
    }
    /**
     * Realiza una petición con reintentos automáticos
     */
    async makeRequestWithRetry(url, options = {}, maxRetries = 3) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 Intento ${attempt}/${maxRetries} de petición a API...`
          );
          const response = await this.makeRequest(url, options);
          if (response.ok) {
            console.log(`✅ Petición exitosa en intento ${attempt}`);
            return response;
          } else {
            const errorText = await response.text();
            lastError = new Error(
              `API respondió con error ${response.status}: ${errorText}`
            );
            console.warn(`⚠️ Intento ${attempt} falló: ${lastError.message}`);
          }
        } catch (error) {
          lastError = error;
          console.warn(`⚠️ Intento ${attempt} falló: ${error}`);
          // Si no es el último intento, esperar antes del siguiente
          if (attempt < maxRetries) {
            const waitTime = options.retryDelay || Math.pow(2, attempt) * 1000; // Backoff exponencial
            console.log(
              `⏳ Esperando ${waitTime / 1000}s antes del siguiente intento...`
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }
      throw lastError || new Error("Error desconocido en petición a API");
    }
    /**
     * Valida imágenes antes de enviarlas a la API
     */
    async validateImagesBeforeAPI(images) {
      const validatedImages = [];
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          // Validar formato base64
          if (!image.startsWith("data:image/")) {
            console.warn(`⚠️ Imagen ${i + 1}: No es un data URL válido`);
            continue;
          }
          // Validar tamaño mínimo
          if (image.length < 10000) {
            console.warn(
              `⚠️ Imagen ${i + 1}: Muy pequeña (${image.length} caracteres)`
            );
            continue;
          }
          // Validar contenido de la imagen
          const hasContent = await this.validateImageContent(image);
          if (!hasContent) {
            console.warn(`⚠️ Imagen ${i + 1}: No tiene contenido válido`);
            continue;
          }
          validatedImages.push(image);
          console.log(`✅ Imagen ${i + 1} validada correctamente`);
        } catch (error) {
          console.warn(`⚠️ Error validando imagen ${i + 1}:`, error);
        }
      }
      return validatedImages;
    }
    /**
     * Valida que la imagen tenga contenido real
     */
    async validateImageContent(image) {
      return new Promise((resolve) => {
        try {
          const img = new Image();
          img.onload = () => {
            // Verificar dimensiones mínimas
            if (img.width < 100 || img.height < 100) {
              console.warn(
                `⚠️ Imagen tiene dimensiones insuficientes: ${img.width}x${img.height}`
              );
              resolve(false);
              return;
            }
            // Verificar que no sea completamente transparente
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(false);
              return;
            }
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );
            const hasContent = this.checkImageHasContent(imageData);
            resolve(hasContent);
          };
          img.onerror = () => {
            console.warn(`⚠️ Error cargando imagen para validación`);
            resolve(false);
          };
          img.src = image;
        } catch (error) {
          console.warn(`⚠️ Error en validación de imagen:`, error);
          resolve(false);
        }
      });
    }
    /**
     * Verifica que la imagen tenga contenido (no sea completamente transparente o del mismo color)
     */
    checkImageHasContent(imageData) {
      const data = imageData.data;
      const pixelCount = data.length / 4;
      let nonTransparentPixels = 0;
      let colorVariation = 0;
      // Contar píxeles no transparentes y variación de color
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha > 10) {
          // No completamente transparente
          nonTransparentPixels++;
          // Calcular variación de color
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          colorVariation += Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
        }
      }
      // Verificar que tenga suficientes píxeles no transparentes
      const nonTransparentRatio = nonTransparentPixels / pixelCount;
      if (nonTransparentRatio < 0.1) {
        return false; // Menos del 10% de píxeles visibles
      }
      // Verificar que tenga variación de color (no sea una imagen de un solo color)
      const avgColorVariation = colorVariation / nonTransparentPixels;
      if (avgColorVariation < 5) {
        return false; // Muy poca variación de color
      }
      return true;
    }
    /**
     * Obtiene la URL base de la API
     */
    getApiBaseUrl() {
      return this.apiBaseUrl;
    }
    /**
     * Obtiene el timeout configurado
     */
    getApiTimeout() {
      return this.apiTimeout;
    }
  }

  /**
   * RegistrationHandler - Maneja la lógica de registro de usuarios
   *
   * Responsabilidades:
   * - Enviar registros a la API
   * - Manejar fallback local si la API falla
   * - Validar datos de usuario antes de registrar
   */
  class RegistrationHandler {
    constructor(apiHandler, storageService, callbacks = {}) {
      this.apiHandler = apiHandler;
      this.storageService = storageService;
      this.callbacks = callbacks;
    }
    /**
     * Registra un usuario con imágenes en la API
     */
    async register(userData, images, livenessGestures) {
      if (!images || images.length === 0) {
        throw new Error("No hay imágenes para registrar");
      }
      // Validar imágenes antes de enviar
      const validatedImages =
        await this.apiHandler.validateImagesBeforeAPI(images);
      if (validatedImages.length === 0) {
        throw new Error(
          "No hay imágenes válidas para registrar después de la validación"
        );
      }
      const totalSize = validatedImages.reduce(
        (sum, img) => sum + img.length,
        0
      );
      const totalSizeMB = totalSize / (1024 * 1024);
      console.log(
        `📸 Enviando ${validatedImages.length} imágenes validadas a la API (${totalSizeMB.toFixed(2)}MB total)`
      );
      // Construir payload
      const payload = {
        person_id: userData.id || "unknown",
        person_name: userData.name || "Unknown User",
        images_base64: validatedImages,
        person_email: userData.email,
        metadata: {
          source: "sfi-facial-component",
          timestamp: new Date().toISOString(),
          image_count: validatedImages.length,
          total_size_bytes: totalSize,
          component_version: "1.0.0",
          liveness_gestures: livenessGestures,
        },
      };
      const url = `${this.apiHandler.getApiBaseUrl()}/register_person`;
      console.log(`🌐 Haciendo petición a: ${url}`);
      // Cerrar cámara si está disponible
      if (this.callbacks.stopCamera) {
        console.log("📹 Cerrando cámara - ya no se necesita para el registro");
        this.callbacks.stopCamera();
      }
      try {
        console.log(`📤 Enviando registro a API...`);
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.apiHandler.getApiTimeout()),
        });
        console.log(`📥 Respuesta recibida: HTTP ${response.status}`);
        if (response.ok) {
          const result = await response.json();
          console.log(`📥 Datos de respuesta:`, result);
          // 🔧 CRÍTICO: Verificar el campo 'success' del backend
          // El backend puede devolver HTTP 200 pero con success: false
          if (result.success === false) {
            const errorMsg =
              result.message || "Error desconocido en el registro";
            console.error(`❌ Backend rechazó el registro: ${errorMsg}`);
            throw new Error(errorMsg);
          }
          console.log(`✅ Registro exitoso en API`);
          // Emitir evento de éxito
          if (this.callbacks.emitEvent) {
            this.callbacks.emitEvent("register-success", result);
          }
          // Callback de éxito
          if (this.callbacks.onRegistrationSuccess) {
            this.callbacks.onRegistrationSuccess(result);
          }
          return result;
        } else {
          // Cualquier error HTTP (4xx o 5xx) se maneja aquí
          let errorMsg = `Error ${response.status}`;
          try {
            // Intentar parsear como JSON para obtener el mensaje del backend
            const errorData = await response.json();
            console.log("📥 Error data recibido:", errorData);
            if (errorData.message) {
              errorMsg = errorData.message;
            } else if (errorData.detail) {
              // detail puede ser un objeto o string
              if (
                typeof errorData.detail === "object" &&
                errorData.detail.message
              ) {
                errorMsg = errorData.detail.message;
              } else if (typeof errorData.detail === "string") {
                errorMsg = errorData.detail;
              } else {
                errorMsg = JSON.stringify(errorData.detail);
              }
            } else {
              errorMsg = JSON.stringify(errorData);
            }
          } catch (parseError) {
            // Si no es JSON, usar el texto plano
            const errorText = await response.text();
            errorMsg = errorText || `Error ${response.status}`;
          }
          console.error(
            `❌ API respondió con error ${response.status}: ${errorMsg}`
          );
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error(`❌ Error al intentar registrar:`, error);
        // Propagar el error directamente - NO usar fallback
        // El error será capturado en handleCapturePhoto() y mostrado al usuario
        throw error;
      }
    }
  }

  /**
   * ValidationHandler - Maneja la lógica de validación de identidad
   *
   * Responsabilidades:
   * - Enviar validaciones a la API
   * - Manejar fallback local si la API falla
   * - Comparar rostros usando servicios locales
   */
  class ValidationHandler {
    constructor(apiHandler, storageService, facialComparison, callbacks = {}) {
      this.apiHandler = apiHandler;
      this.storageService = storageService;
      this.facialComparison = facialComparison;
      this.callbacks = callbacks;
    }
    /**
     * Valida una identidad con la API
     */
    async validate(personId, image) {
      // Validar que la imagen sea válida
      if (!image || image.length < 5000) {
        throw new Error(
          "La imagen proporcionada no es válida o es demasiado pequeña"
        );
      }
      const requestData = {
        person_id: personId,
        image_base64: image,
      };
      // Cerrar cámara si está disponible
      if (this.callbacks.stopCamera) {
        console.log(
          "📹 Cerrando cámara - ya no se necesita para la validación con API"
        );
        this.callbacks.stopCamera();
      }
      // 🔧 CRÍTICO: Hacer UNA SOLA petición, sin bucles de reintento
      try {
        console.log(`📤 Enviando validación a API...`);
        const response = await fetch(
          `${this.apiHandler.getApiBaseUrl()}/validate_identity`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestData),
            signal: AbortSignal.timeout(this.apiHandler.getApiTimeout()),
          }
        );
        console.log(`📥 Respuesta recibida: HTTP ${response.status}`);
        if (response.ok) {
          const result = await response.json();
          console.log(`📥 Datos de respuesta:`, result);
          // Emitir evento según el resultado
          if (result.is_match || result.isMatch) {
            if (this.callbacks.emitEvent) {
              this.callbacks.emitEvent("validate-success", result);
            }
            if (this.callbacks.onValidationSuccess) {
              this.callbacks.onValidationSuccess(result);
            }
            if (this.callbacks.changePhase) {
              this.callbacks.changePhase("complete");
            }
          } else {
            if (this.callbacks.emitEvent) {
              this.callbacks.emitEvent("validate-failed", result);
            }
            if (this.callbacks.onValidationFailed) {
              this.callbacks.onValidationFailed(result);
            }
            if (this.callbacks.changePhase) {
              this.callbacks.changePhase("complete");
            }
          }
          return result;
        } else {
          // Error HTTP (4xx o 5xx)
          let errorMsg = `Error ${response.status}`;
          try {
            // Intentar parsear como JSON para obtener el mensaje del backend
            const errorData = await response.json();
            console.log("📥 Error data recibido:", errorData);
            // Extraer mensaje de error del backend
            if (errorData.detail) {
              if (typeof errorData.detail === "object") {
                // Si detail es objeto, extraer recommendation o mensaje
                errorMsg =
                  errorData.detail.recommendation ||
                  errorData.detail.message ||
                  JSON.stringify(errorData.detail);
              } else if (typeof errorData.detail === "string") {
                errorMsg = errorData.detail;
              }
            } else if (errorData.message) {
              errorMsg = errorData.message;
            }
          } catch (parseError) {
            // Si no es JSON, usar texto plano
            const errorText = await response.text();
            errorMsg = errorText || `Error ${response.status}`;
          }
          console.error(
            `❌ API respondió con error ${response.status}: ${errorMsg}`
          );
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error(`❌ Error al intentar validar:`, error);
        // Propagar el error directamente - NO usar fallback
        // El error será manejado en el componente principal
        throw error;
      }
    }
  }

  /**
   * SignatureHandler - Maneja la lógica de firma digital
   *
   * Responsabilidades:
   * - Validar identidad antes de firmar
   * - Procesar firma de documentos
   * - Manejar eventos de firma
   */
  class SignatureHandler {
    constructor(signatureService, callbacks = {}) {
      this.signatureService = signatureService;
      this.callbacks = callbacks;
    }
    /**
     * Valida la identidad antes de firmar
     */
    async validateForSigning(personId, faceData) {
      console.log("🖊️ Procesando validación biométrica para firma");
      try {
        // Cambiar a fase de procesamiento si está disponible
        if (this.callbacks.changePhase) {
          this.callbacks.changePhase("processing");
        }
        // Validar identidad usando el servicio de firma
        const validationResult = await this.signatureService.validateForSigning(
          personId,
          faceData.image.split(",")[1] // Remover prefijo data:image
        );
        // Emitir evento de validación completa
        if (this.callbacks.emitEvent) {
          this.callbacks.emitEvent(
            "sign-validation-complete",
            validationResult
          );
        }
        // Callback de validación completa
        if (this.callbacks.onValidationComplete) {
          this.callbacks.onValidationComplete(validationResult);
        }
        if (!validationResult.ready_to_sign) {
          const errorMessage = `Validación fallida: ${validationResult.message}`;
          if (this.callbacks.showError) {
            this.callbacks.showError(errorMessage);
          }
          throw new Error(errorMessage);
        }
        return validationResult;
      } catch (error) {
        console.error("❌ Error en validación para firma:", error);
        const errorMessage = `Error de validación: ${error instanceof Error ? error.message : "Error desconocido"}`;
        if (this.callbacks.showError) {
          this.callbacks.showError(errorMessage);
        }
        if (this.callbacks.onSignError) {
          this.callbacks.onSignError(
            error instanceof Error ? error : new Error(errorMessage)
          );
        }
        throw error;
      }
    }
    /**
     * Procesa la firma del documento
     */
    async signDocument(signRequest, faceData, metadata) {
      console.log("🖊️ Procesando firma del documento");
      try {
        // Emitir evento de procesamiento
        if (this.callbacks.emitEvent) {
          this.callbacks.emitEvent("sign-processing", {
            status: "signing_document",
          });
        }
        // Realizar la firma
        const signResult = await this.signatureService.signDocument(
          signRequest,
          faceData.image.split(",")[1], // Remover prefijo data:image
          {
            liveness_score: faceData.livenessScore,
            captured_photos_count: metadata?.captured_photos_count || 0,
            component_version: metadata?.component_version || "1.0.0",
          }
        );
        if (signResult.success) {
          // Emitir evento de éxito
          if (this.callbacks.emitEvent) {
            this.callbacks.emitEvent("sign-success", signResult);
          }
          // Callback de éxito
          if (this.callbacks.onSignSuccess) {
            this.callbacks.onSignSuccess(signResult);
          }
        } else {
          const errorMessage = `Error en firma: ${signResult.message}`;
          if (this.callbacks.showError) {
            this.callbacks.showError(errorMessage);
          }
          if (this.callbacks.onSignError) {
            this.callbacks.onSignError(new Error(errorMessage));
          }
        }
        return signResult;
      } catch (error) {
        console.error("❌ Error procesando firma:", error);
        const errorMessage = `Error de firma: ${error instanceof Error ? error.message : "Error desconocido"}`;
        if (this.callbacks.showError) {
          this.callbacks.showError(errorMessage);
        }
        // Emitir evento de error
        if (this.callbacks.emitEvent) {
          this.callbacks.emitEvent("sign-error", {
            code: "SIGN_PROCESSING_ERROR",
            message: errorMessage,
          });
        }
        if (this.callbacks.onSignError) {
          this.callbacks.onSignError(
            error instanceof Error ? error : new Error(errorMessage)
          );
        }
        throw error;
      }
    }
    /**
     * Procesa validación y firma en un solo flujo
     */
    async validateAndSign(personId, signRequest, faceData, metadata) {
      // Primero validar
      await this.validateForSigning(personId, faceData);
      // Luego firmar
      return await this.signDocument(signRequest, faceData, metadata);
    }
  }

  class SfiFacial extends HTMLElement {
    static get observedAttributes() {
      return [
        "mode",
        "disabled",
        "api-url",
        "blink-threshold",
        "smile-threshold",
        "head-threshold",
        "api-timeout",
        "person-id",
        "person-name",
        "document-hash",
        "safemetrics-form-id",
        // Auto-binding attributes
        "auto-bind",
        "person-id-input",
        "document-hash-input",
        "start-button",
        "result-container",
        "debug-container",
        "button-bg-color",
        "button-text-color",
        "button-border-color",
        "button-border-radius",
        "button-font-size",
        "button-font-weight",
        "button-padding",
        "button-box-shadow",
        "button-hover-transform",
        "button-hover-box-shadow",
      ];
    }
    constructor() {
      super();
      this._mode = "register";
      this._disabled = false;
      this._processing = false;
      this.currentProcess = "idle";
      this.currentUserData = null;
      // 🎯 NUEVO SISTEMA DE FASES: Estados bien definidos para cada modo
      this.currentPhase = "button";
      this.livenessCompleted = false;
      this.cameraInitializing = false;
      // 🔧 NUEVO: Captura de fotos durante gestos con metadata
      this.capturedPhotos = [];
      // 🔧 NUEVO: Control de eventos duplicados
      this.gesturesCompletedProcessed = false;
      // Camera and processing
      this.videoElement = null;
      this.canvasElement = null;
      this.canvasContext = null;
      this.processingInterval = null;
      this.renderingInterval = null;
      // 🔧 NUEVO: Referencias a event listeners de window para poder limpiarlos
      this.windowEventListeners = [];
      // 🔧 NUEVO: Referencias a event listeners de elementos externos para poder limpiarlos
      this.externalEventListeners = [];
      // API Configuration
      this.apiBaseUrl = "https://api-facialsafe.service.saferut.com"; // Default API URL
      this._apiTimeout = 10000; // 10 seconds default timeout
      // 🔧 NUEVO: Props para datos de usuario
      this.personId = null;
      this.personName = null;
      // Auto-binding properties
      this.autoBind = false;
      this.personIdInputId = null;
      this.documentHashInputId = null;
      this.startButtonId = null;
      this.resultContainerId = null;
      this.debugContainerId = null;
      // 🖊️ NUEVO: Props para modo firma
      this.documentHash = null;
      this.safemetricsFormId = null;
      this.signatureRequest = null;
      this.currentSignResult = null;
      // 🔧 NUEVO: Configuración de umbrales
      this.blinkThreshold = 0.15;
      this.smileThreshold = 0.07;
      this.headThreshold = 0.4;
      // Dibujar malla facial COMPLETA con landmarks del MediaPipe DINÁMICO
      this.scanLinePosition = 0;
      this.scanLineDirection = 1;
      this.analysisProgress = 0;
      // 🔧 CRÍTICO: Crear shadowRoot explícitamente
      this.attachShadow({ mode: "open" });
      // 🔧 CORREGIDO: Generar ID único para esta instancia
      this._instanceId = `sfi-facial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // 🔧 CORREGIDO: Verificar si ya existe una instancia activa
      if (
        SfiFacial._globalInstanceId &&
        SfiFacial._globalInstanceId !== this._instanceId
      ) {
        console.warn(
          "⚠️ Múltiples instancias detectadas. Usando datos globales compartidos."
        );
      }
      // 🔧 CORREGIDO: Establecer esta instancia como la global
      SfiFacial._globalInstanceId = this._instanceId;
      // 🔧 CORREGIDO: Restaurar datos de usuario si existen
      if (SfiFacial._globalUserData) {
        this.currentUserData = SfiFacial._globalUserData;
        console.log(
          "🔄 Restaurando datos de usuario desde instancia global:",
          this.currentUserData
        );
      }
      // 🔧 CORREGIDO: Inicializar array de fotos capturadas
      this.capturedPhotos = [];
      this.gesturesCompletedProcessed = false;
      // 🔧 DEBUG: Log inicial
      console.log("🏗️ SfiFacial constructor, modo inicial:", this.mode);
      console.log("🏗️ ID de instancia:", this._instanceId);
      // Initialize services
      this.storageService = new StorageService();
      this.cameraService = new CameraService();
      this.livenessDetector = new LivenessDetector();
      this.facialComparison = new FacialComparisonService();
      // Inicialización básica del SignatureService - se actualizará en connectedCallback
      this.signatureService = new SignatureService({
        apiBaseUrl: this.apiBaseUrl,
        timeout: this._apiTimeout,
        eventDispatcher: (eventName, detail) => {
          const event = new CustomEvent(eventName, { detail });
          this.dispatchEvent(event);
        },
      });
      console.log(
        `🔧 SignatureService inicial creado con timeout: ${this._apiTimeout}ms`
      );
      // Inicializar configuración del proyecto de referencia
      this.config = { system: { processingInterval: 150 } };
      // 🔧 CORREGIDO: Ahora el shadowRoot está disponible inmediatamente
      this.render();
      this.setupEventListeners();
      this.setupInternalEventListeners();
      // Initialize MediaPipe
      this.initializeMediaPipe();
    }
    // Lifecycle method llamado cuando el elemento se conecta al DOM
    connectedCallback() {
      // Asegurar que el SignatureService tenga la configuración correcta después de procesar atributos
      console.log(
        `🔧 connectedCallback: Reconfigurando SignatureService con timeout actual: ${this._apiTimeout}ms`
      );
      this.signatureService = new SignatureService({
        apiBaseUrl: this.apiBaseUrl,
        timeout: this._apiTimeout,
        eventDispatcher: (eventName, detail) => {
          const event = new CustomEvent(eventName, { detail });
          this.dispatchEvent(event);
        },
      });
      // Setup auto-binding if enabled
      if (this.autoBind) {
        setTimeout(() => this.setupAutoBinding(), 200);
      }
    }
    // 🔧 NUEVO: Lifecycle method para limpiar recursos cuando el componente se desconecta
    disconnectedCallback() {
      console.log("🧹 Limpiando recursos del componente SfiFacial...");
      this.cleanup();
    }
    /**
     * Configura el auto-binding con elementos del DOM externo
     */
    setupAutoBinding() {
      console.log("🔗 Configurando auto-binding...");
      try {
        // 1. Conectar botón de inicio
        if (this.startButtonId) {
          const startButton = document.getElementById(this.startButtonId);
          if (startButton) {
            const clickHandler = () => this.handleAutoStart();
            startButton.addEventListener("click", clickHandler);
            this.externalEventListeners.push({
              element: startButton,
              event: "click",
              handler: clickHandler,
            });
            console.log(`✅ Botón conectado: ${this.startButtonId}`);
          } else {
            console.warn(`⚠️ Botón no encontrado: ${this.startButtonId}`);
          }
        }
        // 2. Configurar eventos automáticos
        this.setupAutoEvents();
        console.log("✅ Auto-binding configurado correctamente");
      } catch (error) {
        console.error("❌ Error configurando auto-binding:", error);
      }
    }
    /**
     * Maneja el inicio automático desde el botón externo
     */
    handleAutoStart() {
      console.log("🚀 Auto-start iniciado...");
      try {
        // 1. Obtener valores de los inputs
        let personId = this.personId;
        let documentHash = this.documentHash;
        // Si no están configurados como atributos, obtenerlos de los inputs
        if (!personId && this.personIdInputId) {
          const input = document.getElementById(this.personIdInputId);
          personId = input?.value?.trim() || null;
        }
        if (!documentHash && this.documentHashInputId) {
          const input = document.getElementById(this.documentHashInputId);
          documentHash = input?.value?.trim() || null;
        }
        // 2. Validar datos requeridos
        if (!personId || !documentHash) {
          const missing = [];
          if (!personId) missing.push("Person ID");
          if (!documentHash) missing.push("Document Hash");
          this.showAutoError(
            `Campos requeridos faltantes: ${missing.join(", ")}`
          );
          return;
        }
        // 3. Configurar el componente
        this.personId = personId;
        this.documentHash = documentHash;
        console.log(
          `🔗 Auto-configurado: PersonID=${personId}, DocumentHash=${documentHash.substring(0, 8)}...`
        );
        // 4. Iniciar el proceso
        if (this.mode === "sign") {
          this.start();
        } else {
          console.warn('⚠️ Auto-binding solo soporta modo "sign" actualmente');
        }
      } catch (error) {
        console.error("❌ Error en auto-start:", error);
        this.showAutoError(
          `Error: ${error instanceof Error ? error.message : "Error desconocido"}`
        );
      }
    }
    /**
     * Configura eventos automáticos para mostrar resultados
     */
    setupAutoEvents() {
      // Evento de éxito
      this.addEventListener("sign-success", (event) => {
        const data = event.detail;
        this.showAutoResult(data, true);
      });
      // Evento de error
      this.addEventListener("sign-error", (event) => {
        const data = event.detail;
        this.showAutoResult(data, false);
      });
      // Debug events si hay contenedor de debug
      if (this.debugContainerId) {
        this.setupAutoDebugEvents();
      }
    }
    /**
     * Muestra resultado automáticamente en el contenedor
     */
    showAutoResult(data, isSuccess) {
      if (!this.resultContainerId) return;
      const container = document.getElementById(this.resultContainerId);
      if (!container) {
        console.warn(
          `⚠️ Contenedor de resultado no encontrado: ${this.resultContainerId}`
        );
        return;
      }
      const icon = isSuccess ? "✅" : "❌";
      const title = isSuccess ? "Firma Exitosa" : "Error en Firma";
      const bgColor = isSuccess ? "#d4edda" : "#f8d7da";
      const borderColor = isSuccess ? "#28a745" : "#dc3545";
      let html = `
      <div style="
        background: ${bgColor}; 
        border: 2px solid ${borderColor}; 
        border-radius: 8px; 
        padding: 20px; 
        margin: 10px 0;
        font-family: Arial, sans-serif;
      ">
        <h3 style="margin-top: 0;">${icon} ${title}</h3>
    `;
      if (isSuccess && data.success) {
        html += `
        <p><strong>🆔 ID de Firma:</strong> ${data.signature_id}</p>
        <p><strong>👤 Persona:</strong> ${data.person_name} (${data.person_id})</p>
        <p><strong>🎯 Confianza:</strong> ${(data.confidence_score * 100).toFixed(1)}%</p>
      `;
        if (data.qr_png) {
          html += `
          <div style="text-align: center; margin: 15px 0;">
            <h4>📱 QR de Verificación:</h4>
            <img src="${data.qr_png}" alt="QR de verificación" style="max-width: 200px; border-radius: 8px;">
          </div>
        `;
        }
        if (data.qr_url) {
          html += `<p><strong>🔗 URL:</strong> <a href="${data.qr_url}" target="_blank">${data.qr_url}</a></p>`;
        }
      } else {
        html += `<p><strong>Error:</strong> ${data.message || "Error desconocido"}</p>`;
      }
      html += "</div>";
      container.innerHTML = html;
    }
    /**
     * Muestra errores automáticamente
     */
    showAutoError(message) {
      if (this.resultContainerId) {
        const container = document.getElementById(this.resultContainerId);
        if (container) {
          container.innerHTML = `
          <div style="
            background: #f8d7da; 
            border: 2px solid #dc3545; 
            border-radius: 8px; 
            padding: 15px; 
            margin: 10px 0;
            color: #721c24;
            font-family: Arial, sans-serif;
          ">
            <strong>❌ Error:</strong> ${message}
          </div>
        `;
        }
      }
      // También mostrar en consola
      console.error("🔗 Auto-binding error:", message);
    }
    /**
     * Configura eventos de debug automáticos
     */
    setupAutoDebugEvents() {
      const debugContainer = document.getElementById(this.debugContainerId);
      if (!debugContainer) return;
      // Función para agregar logs de debug
      const addDebugLog = (message, type = "info") => {
        const timestamp = new Date().toLocaleTimeString();
        const colors = {
          info: "#28a745",
          success: "#007bff",
          error: "#dc3545",
          warning: "#ffc107",
        };
        const log = document.createElement("div");
        log.style.cssText = `
        color: ${colors[type]};
        margin: 2px 0;
        font-family: 'Courier New', monospace;
        font-size: 12px;
      `;
        log.textContent = `[${timestamp}] ${message}`;
        debugContainer.appendChild(log);
        debugContainer.scrollTop = debugContainer.scrollHeight;
      };
      // Configurar todos los eventos de debug
      const debugEvents = [
        "sign-validation-start",
        "sign-validation-progress",
        "sign-validation-result",
        "sign-request-start",
        "sign-request-progress",
        "sign-response",
        "liveness-progress",
      ];
      debugEvents.forEach((eventName) => {
        this.addEventListener(eventName, (event) => {
          const data = event.detail;
          addDebugLog(
            `${eventName.toUpperCase()}: ${JSON.stringify(data)}`,
            "info"
          );
        });
      });
      addDebugLog("🔧 Auto-debug configurado", "info");
    }
    async initializeMediaPipe() {
      try {
        await this.livenessDetector.initialize();
        console.log("✅ MediaPipe inicializado correctamente");
      } catch (error) {
        console.warn("MediaPipe initialization error:", error);
      }
    }
    get mode() {
      return this._mode;
    }
    set mode(value) {
      this._mode = value;
      this.updateButton();
    }
    // Public getters for external access
    get livenessDetectorInstance() {
      return this.livenessDetector;
    }
    get mediaPipeService() {
      return this.livenessDetector.mediaPipeService;
    }
    // Public method to get current MediaPipe landmarks
    getCurrentLandmarks() {
      try {
        // Intentar obtener landmarks del liveness detector
        const landmarks =
          this.livenessDetector.mediaPipeService?.getLastLandmarks() || [];
        // Emitir evento para actualizar la malla facial
        if (landmarks.length > 0) {
          this.emitEvent("landmarks-updated", landmarks);
        }
        return landmarks;
      } catch (error) {
        console.warn("Error obteniendo landmarks:", error);
        return [];
      }
    }
    // Public method to draw landmarks on canvas (for real-time visualization)
    drawLandmarksOnCanvas(canvas, options = {}) {
      const landmarks = this.getCurrentLandmarks();
      const mediaPipeService = this.livenessDetector.mediaPipeService;
      if (
        landmarks.length > 0 &&
        mediaPipeService &&
        mediaPipeService.drawLandmarks
      ) {
        mediaPipeService.drawLandmarks(canvas, landmarks, options);
      }
    }
    // Public getters for component state
    get isInitialized() {
      return this.livenessDetector.mediaPipeService?.isInitialized() || false;
    }
    get isProcessing() {
      return this._processing;
    }
    // Public method to start continuous frame processing for real-time landmarks
    async startContinuousProcessing(videoElement) {
      try {
        console.log("🎬 Iniciando procesamiento continuo de MediaPipe Real...");
        const mediaPipeService = this.livenessDetector.mediaPipeService;
        if (mediaPipeService && mediaPipeService.startDetection) {
          // Use real MediaPipe continuous detection
          const result = await mediaPipeService.startDetection(
            videoElement,
            (landmarks) => {
              // Emitir evento para actualizar la malla facial
              if (landmarks && landmarks.length > 0) {
                this.emitEvent("landmarks-updated", landmarks);
                console.log(
                  `🎯 Landmarks actualizados: ${landmarks.length} puntos`
                );
              }
            }
          );
          if (result.success) {
            console.log("✅ MediaPipe Real detección continua iniciada");
            return true;
          }
        }
        // Fallback to interval-based processing
        if (this.processingInterval) {
          clearInterval(this.processingInterval);
        }
        this.processingInterval = window.setInterval(async () => {
          try {
            if (this.livenessDetector.mediaPipeService?.isInitialized()) {
              const landmarks =
                await this.livenessDetector.mediaPipeService.detectFaces(
                  videoElement
                );
              if (landmarks && landmarks.length > 0) {
                // Emitir evento para actualizar la malla facial
                this.emitEvent("landmarks-updated", landmarks);
                console.log(
                  `🎯 Landmarks actualizados: ${landmarks.length} puntos`
                );
              }
            }
          } catch (error) {
            console.warn("Error en procesamiento continuo:", error);
          }
        }, 100);
        return true;
      } catch (error) {
        console.error("Error iniciando procesamiento continuo:", error);
        return false;
      }
    }
    // Public method to stop continuous frame processing
    stopContinuousProcessing() {
      const mediaPipeService = this.livenessDetector.mediaPipeService;
      // Stop real MediaPipe detection if available
      if (mediaPipeService && mediaPipeService.stopDetection) {
        mediaPipeService.stopDetection();
      }
      // Stop fallback interval
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }
      console.log("⏸️ Procesamiento continuo detenido");
    }
    start() {
      if (this.mode === "sign") {
        this.handleSignStart();
      } else {
        console.warn(
          `⚠️ Método start() llamado en modo ${this.mode}. Solo es aplicable en modo 'sign'.`
        );
      }
    }
    get disabled() {
      return this._disabled;
    }
    set disabled(value) {
      this._disabled = value;
      this.button.disabled = value || this._processing;
    }
    get processing() {
      return this._processing;
    }
    // API URL getter/setter
    get apiUrl() {
      return this.apiBaseUrl;
    }
    set apiUrl(value) {
      this.apiBaseUrl = value;
      // 🔧 REFACTORIZADO: Actualizar APIHandler si está inicializado
      if (this.apiHandler) {
        this.apiHandler.updateConfig({ apiBaseUrl: value });
      }
      // Actualizar el SignatureService con la nueva URL
      this.signatureService = new SignatureService({
        apiBaseUrl: value,
        timeout: this._apiTimeout,
        eventDispatcher: (eventName, detail) => {
          const event = new CustomEvent(eventName, { detail });
          this.dispatchEvent(event);
        },
      });
    }
    // 🔧 NUEVO: Actualizar umbrales en el detector de liveness
    updateGestureThresholds() {
      if (this.livenessDetector) {
        this.livenessDetector.updateConfig({
          gestureThresholds: {
            blink: this.blinkThreshold,
            smile: this.smileThreshold,
            headRotation: this.headThreshold,
          },
        });
        console.log(
          `🎯 Umbrales actualizados: blink=${this.blinkThreshold}, smile=${this.smileThreshold}, head=${this.headThreshold}`
        );
      }
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      console.log(
        `🔧 Atributo cambiado: ${name} de "${oldValue}" a "${newValue}"`
      );
      switch (name) {
        case "mode":
          console.log(`🎯 Modo cambiando de "${oldValue}" a "${newValue}"`);
          this.mode = newValue;
          break;
        case "disabled":
          this.disabled = newValue !== null;
          break;
        case "api-url":
          this.apiUrl = newValue;
          break;
        case "api-timeout":
          this.apiTimeout = parseInt(newValue) || 10000;
          break;
        case "blink-threshold":
          this.blinkThreshold = parseFloat(newValue) || 0.15;
          this.updateGestureThresholds();
          break;
        case "smile-threshold":
          this.smileThreshold = parseFloat(newValue) || 0.07;
          this.updateGestureThresholds();
          break;
        case "head-threshold":
          this.headThreshold = parseFloat(newValue) || 0.4;
          this.updateGestureThresholds();
          break;
        case "person-id":
          this.personId = newValue || null;
          console.log(`🔧 Person ID configurado: ${this.personId}`);
          break;
        case "person-name":
          this.personName = newValue || null;
          console.log(`🔧 Person Name configurado: ${this.personName}`);
          break;
        case "document-hash":
          this.documentHash = newValue || null;
          console.log(`🖊️ Document Hash configurado: ${this.documentHash}`);
          break;
        case "safemetrics-form-id":
          this.safemetricsFormId = newValue || null;
          console.log(
            `🖊️ SafeMetrics Form ID configurado: ${this.safemetricsFormId}`
          );
          break;
        // Auto-binding attributes
        case "auto-bind":
          this.autoBind = newValue !== null;
          console.log(
            `🔗 Auto-bind ${this.autoBind ? "activado" : "desactivado"}`
          );
          if (this.autoBind) {
            // Setup auto-binding after DOM is ready
            setTimeout(() => this.setupAutoBinding(), 100);
          }
          break;
        case "person-id-input":
          this.personIdInputId = newValue;
          console.log(`🔗 Person ID input: ${newValue}`);
          break;
        case "document-hash-input":
          this.documentHashInputId = newValue;
          console.log(`🔗 Document hash input: ${newValue}`);
          break;
        case "start-button":
          this.startButtonId = newValue;
          console.log(`🔗 Start button: ${newValue}`);
          break;
        case "result-container":
          this.resultContainerId = newValue;
          console.log(`🔗 Result container: ${newValue}`);
          break;
        case "debug-container":
          this.debugContainerId = newValue;
          console.log(`🔗 Debug container: ${newValue}`);
          break;
        case "button-bg-color":
          console.log(`🎨 Botón color de fondo: ${newValue}`);
          break;
        case "button-text-color":
          console.log(`🎨 Botón color de texto: ${newValue}`);
          break;
        case "button-border-color":
          console.log(`🎨 Botón color de borde: ${newValue}`);
          break;
        case "button-border-radius":
          console.log(`🎨 Botón radio de borde: ${newValue}`);
          break;
        case "button-font-size":
          console.log(`🎨 Botón tamaño de fuente: ${newValue}`);
          break;
        case "button-font-weight":
          console.log(`🎨 Botón peso de fuente: ${newValue}`);
          break;
        case "button-padding":
          console.log(`🎨 Botón padding: ${newValue}`);
          break;
        case "button-box-shadow":
          console.log(`🎨 Botón sombra: ${newValue}`);
          break;
        case "button-hover-transform":
          console.log(`🎨 Botón transformación hover: ${newValue}`);
          break;
        case "button-hover-box-shadow":
          console.log(`🎨 Botón sombra hover: ${newValue}`);
          break;
      }
    }
    render() {
      if (!this.shadowRoot) return;
      // 🔧 REFACTORIZADO: Usar UIRenderer para generar el HTML/CSS
      this.shadowRoot.innerHTML = UIRenderer.render();
      // Get references to elements
      this.button = this.shadowRoot.getElementById("register-btn");
      this.videoElement = this.shadowRoot.getElementById("sfi-video");
      this.canvasElement = this.shadowRoot.getElementById("sfi-canvas");
      this.canvasContext = this.canvasElement?.getContext("2d") || null;
      this.modal = this.shadowRoot.getElementById("modal");
      this.modalOverlay = this.shadowRoot.getElementById("modal-overlay");
      this.nameInput = this.shadowRoot.getElementById("name-input");
      this.emailInput = this.shadowRoot.getElementById("email-input");
      this.idInput = this.shadowRoot.getElementById("id-input");
      this.submitButton = this.shadowRoot.getElementById("submit-btn");
      this.closeButton = this.shadowRoot.getElementById("close-btn");
      // 🔧 NUEVO: Referencias para validación
      this.validateIdInput =
        this.shadowRoot.getElementById("validate-id-input");
      this.validateSubmitButton = this.shadowRoot.getElementById(
        "validate-submit-btn"
      );
      this.modalTitle = this.shadowRoot.getElementById("modal-title");
      this.modalSubtitle = this.shadowRoot.getElementById("modal-subtitle");
      this.registrationForm =
        this.shadowRoot.getElementById("registration-form");
      this.validationForm = this.shadowRoot.getElementById("validation-form");
      // 🎯 NUEVAS REFERENCIAS PARA SISTEMA DE FASES
      this.phaseContainers = {
        button: this.shadowRoot.getElementById("phase-button"),
        liveness_alert: this.shadowRoot.getElementById("phase-liveness-alert"),
        identity_input: this.shadowRoot.getElementById("phase-identity-input"),
        liveness: this.shadowRoot.getElementById("phase-liveness"),
        capture: this.shadowRoot.getElementById("phase-capture"),
        processing: this.shadowRoot.getElementById("phase-processing"),
        error: this.shadowRoot.getElementById("phase-error"),
        complete: this.shadowRoot.getElementById("phase-complete"),
      };
      this.phaseElements = {
        livenessAlertOk: this.shadowRoot.getElementById("liveness-alert-ok"),
        identityInput: this.shadowRoot.getElementById("identity-input"),
        identitySubmit: this.shadowRoot.getElementById("identity-submit"),
        captureBtn: this.shadowRoot.getElementById("capture-btn"),
        resetBtn: this.shadowRoot.getElementById("reset-btn"),
        completeMessage: this.shadowRoot.getElementById("complete-message"),
        errorMessage: this.shadowRoot.getElementById("error-message"),
      };
      this.updateButton();
      this.setupPhaseEventListeners();
      // 🔧 REFACTORIZADO: Inicializar todos los managers y handlers
      this.initializeManagersAndHandlers();
    }
    // 🔧 NUEVO: Inicializar todos los managers y handlers
    initializeManagersAndHandlers() {
      // 1. Inicializar APIHandler
      this.apiHandler = new APIHandler({
        apiBaseUrl: this.apiBaseUrl,
        apiTimeout: this._apiTimeout,
      });
      // 2. Inicializar CameraManager
      this.cameraManager = new CameraManager(
        this.cameraService,
        this.shadowRoot,
        {
          onCameraStarted: () => {
            console.log("✅ Cámara iniciada desde CameraManager");
          },
          onCameraStopped: () => {
            console.log("✅ Cámara detenida desde CameraManager");
          },
          onPhotoCaptured: (photoData) => {
            console.log("✅ Foto capturada desde CameraManager:", photoData);
          },
          onError: (error) => {
            this.emitError("CAMERA_ERROR", error.message);
          },
          emitError: (code, message) => {
            this.emitError(code, message);
          },
        }
      );
      // 3. Inicializar RegistrationHandler
      this.registrationHandler = new RegistrationHandler(
        this.apiHandler,
        this.storageService,
        {
          onRegistrationSuccess: (result) => {
            console.log("✅ Registro exitoso:", result);
            this.showRegisterSuccessResult(result);
          },
          onRegistrationError: (error) => {
            // Este callback solo se usa para errores de red después del fallback local
            console.error(
              "❌ Error crítico en registro (después de fallback):",
              error
            );
            this.emitError("REGISTRATION_ERROR", error.message);
          },
          stopCamera: () => {
            this.cameraManager.stopCamera();
          },
          emitEvent: (eventName, detail) => {
            this.emitEvent(eventName, detail);
          },
        }
      );
      // 4. Inicializar ValidationHandler
      this.validationHandler = new ValidationHandler(
        this.apiHandler,
        this.storageService,
        this.facialComparison,
        {
          onValidationSuccess: (result) => {
            console.log("✅ Validación exitosa:", result);
          },
          onValidationFailed: (result) => {
            console.log("❌ Validación fallida:", result);
          },
          onValidationError: (error) => {
            console.error("❌ Error en validación:", error);
            this.emitError("VALIDATION_ERROR", error.message);
          },
          stopCamera: () => {
            this.cameraManager.stopCamera();
          },
          emitEvent: (eventName, detail) => {
            this.emitEvent(eventName, detail);
          },
          changePhase: (phase) => {
            this.changePhase(phase);
          },
        }
      );
      // 5. Inicializar SignatureHandler
      this.signatureHandler = new SignatureHandler(this.signatureService, {
        onValidationComplete: (result) => {
          console.log("✅ Validación para firma completada:", result);
        },
        onSignSuccess: (result) => {
          console.log("✅ Firma exitosa:", result);
          this.showSignSuccessResult(result);
        },
        onSignError: (error) => {
          console.error("❌ Error en firma:", error);
          this.showError(error.message);
        },
        changePhase: (phase) => {
          this.changePhase(phase);
        },
        showError: (message) => {
          this.showError(message);
        },
        emitEvent: (eventName, detail) => {
          this.emitEvent(eventName, detail);
        },
      });
      // 6. Inicializar PhaseManager
      this.phaseManager = new PhaseManager(
        this.phaseContainers,
        this.phaseElements,
        {
          onPhaseChange: (phase, previousPhase) => {
            this.currentPhase = phase;
          },
          onButtonPhase: () => {
            this.updateButton();
          },
          onLivenessPhase: () => {
            // La cámara se inicia automáticamente en setupCameraForLiveness
          },
          onCapturePhase: () => {
            // Mantener cámara activa para captura
          },
          onProcessingPhase: () => {
            // Mantener cámara activa para procesamiento
          },
          onErrorPhase: () => {
            this.cameraManager.stopCamera();
          },
          onCompletePhase: () => {
            this.cameraManager.stopCamera();
          },
          emitEvent: (eventName, detail) => {
            this.emitEvent(eventName, { ...detail, mode: this.mode });
          },
          stopCamera: () => {
            this.cameraManager.stopCamera();
          },
          updateButton: () => {
            this.updateButton();
          },
        }
      );
    }
    // 🎯 NUEVO: Configurar event listeners para las fases
    setupPhaseEventListeners() {
      // Listener para el alert de liveness
      this.phaseElements.livenessAlertOk?.addEventListener("click", () => {
        this.handleLivenessAlertOk();
      });
      // Listener para submit de identidad
      this.phaseElements.identitySubmit?.addEventListener("click", () => {
        this.handleIdentitySubmit();
      });
      // Listener para captura de foto
      this.phaseElements.captureBtn?.addEventListener("click", () => {
        this.handleCapturePhoto();
      });
      // Listener para reset
      this.phaseElements.resetBtn?.addEventListener("click", () => {
        this.resetToInitialPhase();
      });
    }
    // 🎯 MÉTODO PRINCIPAL: Cambiar fase y limpiar anterior
    // 🔧 REFACTORIZADO: Usar PhaseManager para gestionar las fases
    changePhase(newPhase) {
      if (this.phaseManager) {
        this.phaseManager.changePhase(newPhase);
      } else {
        // Fallback si PhaseManager no está inicializado
        console.warn("⚠️ PhaseManager no inicializado, usando método antiguo");
        this.currentPhase;
        this.currentPhase = newPhase;
        this.cleanupCurrentPhase();
        this.showPhase(newPhase);
        this.emitEvent("phase-changed", {
          phase: newPhase,
          mode: this.mode,
          timestamp: Date.now(),
        });
      }
    }
    // 🧹 LIMPIAR RECURSOS DE LA FASE ACTUAL (SIN CONFLICTOS)
    cleanupCurrentPhase() {
      console.log(`🧹 Limpiando fase actual: ${this.currentPhase}`);
      // Ocultar todos los contenedores de fases
      Object.values(this.phaseContainers).forEach((container) => {
        if (container) container.style.display = "none";
      });
      // Limpieza específica según fase actual (solo si realmente necesario)
      switch (this.currentPhase) {
        case "liveness":
          // Solo limpiar si NO vamos a otra fase de liveness
          console.log("🧹 Limpieza: Fase de liveness anterior");
          break;
        case "identity_input":
          // Limpiar input solo si es necesario
          if (this.phaseElements.identityInput) {
            this.phaseElements.identityInput.value = "";
          }
          break;
        case "processing":
          // Detener procesos en background
          this._processing = false;
          break;
      }
    }
    // 👁️ MOSTRAR FASE ESPECÍFICA
    showPhase(phase) {
      const container = this.phaseContainers[phase];
      if (!container) {
        console.error(`❌ Contenedor de fase '${phase}' no encontrado`);
        return;
      }
      // Mostrar contenedor
      container.style.display = "block";
      // Configuración específica por fase
      switch (phase) {
        case "button":
          this.updateButton();
          // 🔧 CORREGIDO: Ocultar video y canvas cuando se vuelva al botón inicial
          if (this.videoElement) {
            this.videoElement.style.display = "none";
          }
          if (this.canvasElement) {
            this.canvasElement.style.display = "none";
          }
          break;
        case "liveness":
          // 🔧 CORREGIDO: Iniciar cámara automáticamente y mostrar video/canvas
          console.log("🎯 Fase liveness: Iniciando cámara...");
          setTimeout(() => this.setupCameraForLiveness(), 500);
          break;
        case "capture":
          // 🔧 CORREGIDO: Mantener video/canvas visibles para captura
          this.livenessCompleted = true;
          console.log(
            "📸 Fase capture: Manteniendo cámara activa para captura"
          );
          break;
        case "processing":
          // 🔧 CORREGIDO: Mantener video/canvas visibles durante procesamiento
          console.log(
            "⚙️ Fase processing: Manteniendo cámara activa para procesamiento"
          );
          break;
        case "error":
          // 🔧 CORREGIDO: Detener cámara en caso de error
          console.log("❌ Fase error: Deteniendo cámara por error");
          this.stopCamera();
          break;
        case "complete":
          // 🔧 CORREGIDO: Detener cámara solo cuando se complete todo el proceso
          console.log(
            "🔄 Fase complete: Deteniendo cámara después de captura exitosa"
          );
          this.stopCamera();
          // 🔧 CORREGIDO: No mostrar mensaje automático aquí, se manejará en los métodos específicos
          // El mensaje se establecerá en showSignSuccessResult, showRegisterSuccessResult, etc.
          break;
      }
    }
    // 🎯 HANDLERS PARA CADA TRANSICIÓN
    // Modo Register: Button → Modal de Registro
    handleRegisterStart() {
      console.log("📝 Iniciando proceso de registro - Mostrando modal");
      this.showRegistrationModal();
    }
    handleAuthenticateStart() {
      console.log("🔐 Iniciando proceso de autenticación");
      this.changePhase("identity_input");
    }
    // Modo Register: Liveness Alert → Liveness
    handleLivenessAlertOk() {
      console.log(
        "✅ Usuario confirmó liveness alert, iniciando liveness detection"
      );
      this.changePhase("liveness");
      // Iniciar liveness detection automáticamente
      this.setupCameraForLiveness();
    }
    // Modo Validate: Identity Input → Liveness
    handleIdentitySubmit() {
      const identityValue = this.phaseElements.identityInput?.value?.trim();
      if (!identityValue) {
        alert("Número de identificación requerido");
        return;
      }
      // Guardar el ID para uso posterior
      this.currentUserData = {
        id: identityValue,
        name: "",
        email: "",
      };
      console.log(`🆔 ID de autenticación: ${identityValue}`);
      this.changePhase("liveness");
      // Iniciar liveness detection automáticamente
      this.setupCameraForLiveness();
    }
    // Ambos modos: Liveness → Capture (llamado por liveness detector)
    async handleLivenessComplete() {
      console.log("✅ Liveness completado, cambiando a fase capture");
      // 🔍 DEBUG: Verificar estado del video ANTES de cambiar fase
      const videoBefore = this.cameraManager?.getVideoElement();
      console.log(
        "🔍 DEBUG ANTES de changePhase - video.srcObject:",
        videoBefore?.srcObject
      );
      console.log(
        "🔍 DEBUG ANTES de changePhase - video.readyState:",
        videoBefore?.readyState
      );
      this.changePhase("capture");
      // 🔍 DEBUG: Verificar estado del video DESPUÉS de cambiar fase
      const videoAfter = this.cameraManager?.getVideoElement();
      console.log(
        "🔍 DEBUG DESPUÉS de changePhase - video.srcObject:",
        videoAfter?.srcObject
      );
      console.log(
        "🔍 DEBUG DESPUÉS de changePhase - video.readyState:",
        videoAfter?.readyState
      );
      console.log(
        "🔍 DEBUG - ¿Es el mismo elemento?:",
        videoBefore === videoAfter
      );
      // 🔧 NUEVO: Capturar foto automáticamente después de un breve delay
      console.log("📸 Programando captura automática en 1 segundo...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log(
        "📸 Iniciando captura automática después de completar liveness..."
      );
      await this.handleCapturePhoto();
    }
    // Ambos modos: Capture → Processing
    async handleCapturePhoto() {
      console.log(`📸 Iniciando captura REAL de foto en modo: ${this.mode}`);
      this.changePhase("processing");
      try {
        // 🔧 CRÍTICO: Detener el renderizado antes de capturar
        if (this.renderingInterval) {
          console.log("🛑 Deteniendo renderizado automático para captura...");
          clearInterval(this.renderingInterval);
          this.renderingInterval = null;
        }
        // 🔧 CRÍTICO: Asegurar que usamos los elementos de CameraManager (siempre actualizados)
        if (!this.cameraManager) {
          throw new Error("CameraManager no está inicializado");
        }
        // Obtener elementos directamente de CameraManager (SIN reinicializar)
        const videoElement = this.cameraManager.getVideoElement();
        const canvasElement = this.cameraManager.getCanvasElement();
        console.log("🔍 DEBUG - videoElement:", videoElement);
        console.log(
          "🔍 DEBUG - videoElement.srcObject:",
          videoElement?.srcObject
        );
        console.log(
          "🔍 DEBUG - videoElement.videoWidth:",
          videoElement?.videoWidth
        );
        console.log(
          "🔍 DEBUG - videoElement.videoHeight:",
          videoElement?.videoHeight
        );
        if (!videoElement || !canvasElement) {
          throw new Error(
            "Elementos de video/canvas no disponibles en CameraManager"
          );
        }
        // Sincronizar referencias locales
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.canvasContext = this.cameraManager.getCanvasContext();
        console.log(
          "📹 Video element obtenido de CameraManager, readyState:",
          videoElement.readyState
        );
        // 🔧 REFACTORIZADO: Esperar que el video esté listo antes de capturar
        // Verificar que el video esté reproduciéndose y tenga datos
        let attempts = 0;
        const maxAttempts = 100; // 10 segundos máximo (100 * 100ms)
        while (attempts < maxAttempts) {
          // Verificar que el video esté reproduciéndose
          if (videoElement.paused) {
            console.log("⚠️ Video pausado, intentando reproducir...");
            try {
              await videoElement.play();
            } catch (e) {
              console.warn("⚠️ No se pudo reproducir video:", e);
            }
          }
          // Verificar readyState
          if (videoElement.readyState >= 2) {
            // HAVE_CURRENT_DATA o superior
            console.log(
              "✅ Video tiene datos (readyState:",
              videoElement.readyState,
              ")"
            );
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }
        if (videoElement.readyState < 2) {
          console.warn(
            "⚠️ Video no tiene suficientes datos (readyState:",
            videoElement.readyState,
            "), pero intentando capturar..."
          );
        } else {
          console.log(
            "✅ Video está listo para captura (readyState:",
            videoElement.readyState,
            ")"
          );
        }
        // Esperar un momento adicional para estabilizar
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // 4. Capturar foto real usando CameraManager directamente
        let photoData = this.cameraManager.captureHighQualityPhoto();
        if (!photoData) {
          // Intentar una vez más después de esperar
          console.log("⚠️ Primer intento falló, esperando y reintentando...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          photoData = this.cameraManager.captureHighQualityPhoto();
          if (!photoData) {
            throw new Error(
              "No se pudo capturar la foto después de múltiples intentos. Video readyState: " +
                videoElement.readyState
            );
          }
          console.log("✅ Foto capturada exitosamente en segundo intento");
        } else {
          console.log("✅ Foto capturada exitosamente");
        }
        // 5. Enviar según el modo
        if (this.mode === "register") {
          await this.sendRegistrationToAPI(photoData);
        } else if (this.mode === "validate") {
          await this.sendValidationToAPI(photoData);
        } else if (this.mode === "sign") {
          await this.sendSignatureToAPI(photoData);
        }
        // 6. No transicionar automáticamente a complete - se manejará en los métodos específicos
      } catch (error) {
        console.error("❌ Error en captura de foto real:", error);
        this.handleProcessingComplete(
          false,
          error instanceof Error ? error.message : "Error desconocido"
        );
      } finally {
        // 🔧 CORREGIDO: Solo detener cámara después de completar todo el proceso
        // La cámara se mantiene activa hasta que se complete la transición a 'complete'
        console.log(
          "🔄 Manteniendo cámara activa hasta completar transición..."
        );
      }
    }
    // 🔧 REFACTORIZADO: Usar RegistrationHandler
    async sendRegistrationToAPI(photoData) {
      if (!this.registrationHandler) {
        throw new Error("RegistrationHandler no inicializado");
      }
      if (!this.currentUserData) {
        throw new Error("No hay datos de usuario para registro");
      }
      // Obtener gestos de liveness si están disponibles
      const livenessGestures = this.capturedPhotos.map((p) => p.gestureType);
      // Usar RegistrationHandler
      await this.registrationHandler.register(
        this.currentUserData,
        [photoData.data],
        livenessGestures
      );
    }
    // 🔧 REFACTORIZADO: Usar ValidationHandler
    async sendValidationToAPI(photoData) {
      if (!this.validationHandler) {
        throw new Error("ValidationHandler no inicializado");
      }
      if (!this.currentUserData || !this.currentUserData.id) {
        throw new Error("No hay ID de usuario para validación");
      }
      // Usar ValidationHandler
      await this.validationHandler.validate(
        this.currentUserData.id,
        photoData.data
      );
    }
    // 🔧 REFACTORIZADO: Usar SignatureHandler
    async sendSignatureToAPI(photoData) {
      if (!this.signatureHandler) {
        throw new Error("SignatureHandler no inicializado");
      }
      if (!this.signatureRequest) {
        throw new Error("No hay solicitud de firma configurada");
      }
      if (!this.personId) {
        throw new Error("No hay ID de persona para firma");
      }
      // Crear FaceData compatible
      const faceData = {
        landmarks: [],
        image: photoData.data,
        photos: this.capturedPhotos.map((photo, index) => ({
          index,
          data: photo.data,
          timestamp: photo.timestamp,
        })),
        timestamp: Date.now(),
        livenessScore: 0.8,
        blinkAnalysis: undefined,
      };
      // Usar SignatureHandler para validar y firmar
      await this.signatureHandler.validateAndSign(
        this.personId,
        this.signatureRequest,
        faceData,
        {
          liveness_score: faceData.livenessScore,
          captured_photos_count: this.capturedPhotos.length,
          component_version: "1.0.0",
        }
      );
    }
    // Processing → Complete
    handleProcessingComplete(success, message) {
      if (success) {
        this.changePhase("complete");
      } else {
        // 🔧 CORREGIDO: Detener cámara en caso de error antes de cambiar fase
        console.log(
          "🔄 Error en procesamiento: Deteniendo cámara antes de resetear"
        );
        this.stopCamera();
        // Mostrar mensaje de error en la fase de error
        this.changePhase("error");
        if (this.phaseElements.errorMessage) {
          this.phaseElements.errorMessage.textContent = message;
        }
        // Emitir evento de error
        this.emitError("PROCESSING_ERROR", message);
      }
    }
    // Reset a fase inicial
    resetToInitialPhase() {
      // 🔧 CORREGIDO: Detener cámara antes de resetear
      console.log(
        "🔄 Reset: Deteniendo cámara antes de resetear a fase inicial"
      );
      this.stopCamera();
      this.livenessCompleted = false;
      this.currentUserData = null;
      this.changePhase("button");
    }
    // 🎯 MÉTODO REAL: Configurar cámara para liveness (SIN DUPLICACIONES)
    async setupCameraForLiveness() {
      try {
        // Evitar múltiples inicializaciones simultáneas
        if (this.cameraInitializing) {
          console.log("⚠️ Cámara ya se está inicializando, saltando...");
          return;
        }
        this.cameraInitializing = true;
        console.log("📹 Configurando cámara REAL para fase de liveness...");
        // 🔧 REFACTORIZADO: Usar CameraManager para obtener elementos
        if (!this.cameraManager) {
          console.error("❌ CameraManager no inicializado");
          this.changePhase("button");
          return;
        }
        // Asegurar que los elementos estén inicializados
        this.cameraManager.initializeVideoAndCanvas();
        this.videoElement = this.cameraManager.getVideoElement();
        this.canvasElement = this.cameraManager.getCanvasElement();
        this.canvasContext = this.cameraManager.getCanvasContext();
        if (!this.videoElement || !this.canvasElement) {
          console.error(
            "❌ Elementos de video/canvas no disponibles después de inicializar CameraManager"
          );
          this.changePhase("button");
          return;
        }
        // 🔧 CORREGIDO: Solo detener procesamiento, NO la cámara completa
        this._processing = false;
        // Limpiar solo el procesamiento anterior, no la cámara
        if (this.renderingInterval) {
          clearInterval(this.renderingInterval);
          this.renderingInterval = null;
        }
        // Esperar un momento para limpiar recursos
        await new Promise((resolve) => setTimeout(resolve, 300));
        // 1. Configurar la cámara UNA SOLA VEZ
        const cameraResult = await this.setupCamera();
        if (!cameraResult) {
          console.error("❌ Error iniciando cámara real");
          alert("Error accediendo a la cámara");
          this.changePhase("button");
          return;
        }
        console.log("✅ Cámara real iniciada exitosamente");
        console.log("✅ Video y canvas ahora deberían ser visibles");
        // 🔧 REFACTORIZADO: Para el sistema de fases, configurar datos y iniciar liveness directamente
        if (this.mode === "register") {
          // Configurar datos de usuario si no están
          if (!this.currentUserData) {
            const userData = {
              name: this.personName || "Usuario Test",
              id: this.personId || `user-${Date.now()}`,
              email: undefined,
            };
            console.log("📝 Configurando userData para registro:", userData);
            this.setUserData(userData);
          }
          // Iniciar liveness detection directamente
          console.log("✅ Iniciando liveness para registro (sistema de fases)");
          await this.startLivenessDetection();
        } else if (this.mode === "validate") {
          // En validación, solo iniciar liveness detection directamente
          console.log(
            "✅ Iniciando liveness para validación (sistema de fases)"
          );
          await this.startLivenessDetection();
        } else if (this.mode === "sign") {
          // En firma, iniciar liveness detection directamente
          console.log(
            "✅ Iniciando liveness para firma digital (sistema de fases)"
          );
          await this.startLivenessDetection();
        }
        console.log("✅ Flujo de liveness iniciado correctamente");
      } catch (error) {
        console.error("❌ Error configurando cámara real:", error);
        alert(
          "Error accediendo a la cámara: " +
            (error instanceof Error ? error.message : "Error desconocido")
        );
        this.changePhase("button");
      } finally {
        this.cameraInitializing = false;
      }
    }
    updateButton() {
      if (!this.button) return;
      if (this.currentPhase !== "button") return;
      const isRegisterMode = this.mode === "register";
      const isValidationMode = this.mode === "validate";
      const isSignMode = this.mode === "sign";
      if (isRegisterMode) {
        this.button.innerHTML = "👤 Registrar Personal";
        // 🟦 Fondo Azul Sólido (más limpio)
        this.button.style.background = "#2563eb"; // Un azul primario
        // 👤 Sombra sutil para profundidad (ajustar si es necesario)
        this.button.style.boxShadow = "0 4px 15px rgba(37, 99, 235, 0.4)";
      } else if (isValidationMode) {
        this.button.innerHTML = "🔍 Validar Identidad";
        // 🟩 Fondo Verde Sólido
        this.button.style.background = "#059669"; // Un verde esmeralda
        // 🔍 Sombra sutil
        this.button.style.boxShadow = "0 4px 15px rgba(5, 150, 105, 0.4)";
      } else if (isSignMode) {
        this.button.innerHTML = "🖊️ Firmar Documento";
        // 🟠 Fondo Naranja Sólido
        this.button.style.background = "#d97706"; // Un naranja oscuro
        // 🖊️ Sombra sutil
        this.button.style.boxShadow = "0 4px 15px rgba(217, 119, 6, 0.4)";
      }
      // Deshabilitado/Procesando
      this.button.disabled = this._disabled || this._processing;
      // 🎨 Aplicar estilos personalizados (aquí debería ir la base de estilos)
      this.applyCustomButtonStyles();
    }
    // 🎨 NUEVO: Método para aplicar estilos personalizados del botón
    applyCustomButtonStyles() {
      if (!this.button) return;
      // Aplicar estilos desde props
      if (this.buttonBgColor) {
        this.button.style.background = this.buttonBgColor;
      }
      if (this.buttonTextColor) {
        this.button.style.color = this.buttonTextColor;
      }
      if (this.buttonBorderColor) {
        this.button.style.border = `2px solid ${this.buttonBorderColor}`;
      }
      if (this.buttonBorderRadius) {
        this.button.style.borderRadius = this.buttonBorderRadius;
      }
      if (this.buttonFontSize) {
        this.button.style.fontSize = this.buttonFontSize;
      }
      if (this.buttonFontWeight) {
        this.button.style.fontWeight = this.buttonFontWeight;
      }
      if (this.buttonPadding) {
        this.button.style.padding = this.buttonPadding;
      }
      if (this.buttonBoxShadow) {
        this.button.style.boxShadow = this.buttonBoxShadow;
      }
    }
    // ============================================================================
    // Liveness Status UI Methods
    // ============================================================================
    showLivenessStatus() {
      const statusElement = this.shadowRoot?.getElementById(
        "liveness-status-main"
      );
      if (statusElement) {
        statusElement.style.display = "block";
      }
    }
    hideLivenessStatus() {
      const statusElement = this.shadowRoot?.getElementById(
        "liveness-status-main"
      );
      if (statusElement) {
        statusElement.style.display = "none";
      }
    }
    updateGestureStatus(gestureType, status) {
      const statusElement = this.shadowRoot?.getElementById(
        `${gestureType}-status-main`
      );
      if (statusElement) {
        statusElement.className = `gesture-status ${status}`;
      }
    }
    showCountdown(seconds) {
      const countdownElement =
        this.shadowRoot?.getElementById("countdown-main");
      if (countdownElement) {
        countdownElement.style.display = "block";
        countdownElement.textContent = seconds.toString();
      }
    }
    hideCountdown() {
      const countdownElement =
        this.shadowRoot?.getElementById("countdown-main");
      if (countdownElement) {
        countdownElement.style.display = "none";
      }
    }
    updateInstructionText(text) {
      const instructionElement = this.shadowRoot?.getElementById(
        "instruction-text-main"
      );
      if (instructionElement) {
        instructionElement.textContent = text;
      }
    }
    startCountdown(seconds, onComplete) {
      let remaining = seconds;
      const countdown = setInterval(() => {
        this.showCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdown);
          this.hideCountdown();
          onComplete();
        }
        remaining--;
      }, 1000);
    }
    handleGestureCompleted(gestureType, nextGesture) {
      // Marcar gesto actual como completado
      this.updateGestureStatus(gestureType, "completed");
      // 🔧 NUEVO FLUJO: NO capturar foto durante gestos, solo marcar como completado
      console.log(`🎯 Gesto ${gestureType} completado`);
      if (nextGesture) {
        // Mostrar countdown de 2 segundos
        this.updateInstructionText(
          `⏸️ Pausa de 2 segundos antes del siguiente gesto...`
        );
        this.startCountdown(2, () => {
          // Pasar al siguiente gesto
          this.updateGestureStatus(nextGesture, "current");
          this.updateInstructionText(this.getGestureInstruction(nextGesture));
        });
      } else {
        // Todos los gestos completados
        this.updateInstructionText("✅ ¡Todos los gestos completados!");
      }
    }
    // 🔧 NUEVO FLUJO: Manejar cuando todos los gestos están completados - SOLO CERRAR CÁMARA
    handleAllGesturesCompleted(detail) {
      // 🔧 PREVENIR EVENTOS DUPLICADOS
      if (this.gesturesCompletedProcessed) {
        console.log(
          "⚠️ Evento de gestos completados ya procesado, ignorando..."
        );
        return;
      }
      // 🔧 REFACTORIZADO: Verificar ANTES de marcar como procesado
      // En sistema de fases, NO hacer nada aquí - NUNCA detener la cámara
      if (
        this.currentPhase === "liveness" ||
        this.currentPhase === "capture" ||
        this.currentPhase === "processing"
      ) {
        // Sistema de fases: NO hacer nada, el handler de eventos ya manejó la transición
        console.log(
          "⚠️ handleAllGesturesCompleted llamado en sistema de fases (fase:",
          this.currentPhase,
          "), ignorando..."
        );
        console.log(
          "⚠️ La transición a fase capture ya fue manejada por allGesturesCompletedHandler"
        );
        console.log("⚠️ NO deteniendo la cámara - se necesita para captura");
        // NO marcar como procesado aquí para evitar conflictos con el handler
        return; // Salir temprano, no detener la cámara
      }
      this.gesturesCompletedProcessed = true;
      console.log("🎉 Manejando finalización de todos los gestos:", detail);
      console.log(
        `📸 Fotos ya capturadas durante gestos: ${this.capturedPhotos.length}`
      );
      // Sistema antiguo: detener procesamiento y cerrar cámara
      this.stopProcessing();
      this.stopCamera();
      this.hideLivenessStatus();
      // Cambiar instrucciones para pedir clic adicional
      if (this.mode === "validate") {
        console.log(
          "✅ ¡Liveness Completado! Haga clic nuevamente para activar cámara y tomar foto de validación"
        );
      } else {
        console.log(
          "✅ ¡Liveness Completado! Haga clic nuevamente para activar cámara y tomar foto de registro"
        );
      }
      // Cambiar estado para permitir clic adicional
      this._processing = false;
      this.currentProcess = "liveness-completed";
      this.updateButton();
    }
    getGestureInstruction(gestureType) {
      switch (gestureType) {
        case "blink":
          return "👁️ Parpadea naturalmente";
        case "smile":
          return "😊 Sonríe de forma natural y espontánea";
        case "head_rotation":
          return "🔄 Gira tu cabeza suavemente hacia los lados";
        default:
          return "Sigue las instrucciones en pantalla";
      }
    }
    setupEventListeners() {
      // 🎯 NUEVO: Button click con sistema de fases
      this.button.addEventListener("click", () => {
        console.log(
          `🎯 Botón clickeado en modo: ${this.mode}, fase: ${this.currentPhase}`
        );
        // Solo funciona si estamos en la fase 'button'
        if (this.currentPhase !== "button") return;
        if (this.mode === "register") {
          this.handleRegisterStart();
        } else if (this.mode === "validate") {
          this.handleAuthenticateStart();
        } else if (this.mode === "sign") {
          this.handleSignStart();
        }
      });
      // 🔧 REFACTORIZADO: Form submission (solo para modales, no usado en sistema de fases)
      // Los formularios en modales solo se usan si el usuario explícitamente abre el modal
      const form = this.shadowRoot?.getElementById("registration-form");
      if (form) {
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          // Solo procesar si estamos en un contexto de modal (no en sistema de fases)
          if (
            this.currentPhase === "button" ||
            this.modal?.style.display !== "none"
          ) {
            this.handleRegistrationSubmit();
          } else {
            console.warn(
              "⚠️ Formulario de registro enviado fuera del contexto de modal, ignorando..."
            );
          }
        });
      }
      // 🔧 REFACTORIZADO: Validation form submission (solo para modales)
      const validationForm = this.shadowRoot?.getElementById("validation-form");
      if (validationForm) {
        validationForm.addEventListener("submit", (e) => {
          e.preventDefault();
          // Solo procesar si estamos en un contexto de modal (no en sistema de fases)
          if (
            this.currentPhase === "button" ||
            this.modal?.style.display !== "none"
          ) {
            this.handleValidationSubmit();
          } else {
            console.warn(
              "⚠️ Formulario de validación enviado fuera del contexto de modal, ignorando..."
            );
          }
        });
      }
      // Close modal
      this.closeButton.addEventListener("click", () => {
        this.hideRegistrationModal();
      });
      // Cancel button
      const cancelBtn = this.shadowRoot?.getElementById("cancel-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          this.hideRegistrationModal();
        });
      }
      // 🔧 NUEVO: Validation cancel button
      const validateCancelBtn = this.shadowRoot?.getElementById(
        "validate-cancel-btn"
      );
      if (validateCancelBtn) {
        validateCancelBtn.addEventListener("click", () => {
          // 🔧 ELIMINADO: Sistema antiguo de modales - ya no se usa
          // this.hideValidationModal();
        });
      }
      // Input validation
      this.nameInput.addEventListener("input", () =>
        this.validateInput(this.nameInput, "name-error")
      );
      this.idInput.addEventListener("input", () =>
        this.validateInput(this.idInput, "id-error")
      );
      this.emailInput.addEventListener("input", () =>
        this.validateEmail(this.emailInput, "email-error")
      );
      // 🔧 NUEVO: Validation input
      this.validateIdInput.addEventListener("input", () =>
        this.validateInput(this.validateIdInput, "validate-id-error")
      );
    }
    // Configurar listeners para eventos internos
    setupInternalEventListeners() {
      // Escuchar progreso de liveness
      this.addEventListener("liveness-progress", (event) => {
        const progress = event.detail;
        this.updateInstructionsFromProgress(progress);
      });
      // 🎯 NUEVO: Escuchar completion de liveness para registro
      this.addEventListener("register-liveness-complete", () => {
        console.log("🎭 Liveness completado para registro");
        this.updateInstructions(
          "✅ ¡Completado!",
          "Todos los gestos fueron detectados correctamente",
          100
        );
        this.hideLivenessStatus();
        // Transicionar a fase capture
        this.handleLivenessComplete();
      });
      // 🎯 NUEVO: Escuchar completion de liveness general (para validación)
      this.addEventListener("liveness-complete", () => {
        console.log("🎭 Liveness completado (general)");
        this.updateInstructions(
          "✅ ¡Completado!",
          "Todos los gestos fueron detectados correctamente",
          100
        );
        this.hideLivenessStatus();
        // Transicionar a fase capture
        this.handleLivenessComplete();
      });
      // Escuchar errores
      this.addEventListener("error", (event) => {
        const error = event.detail;
        this.updateInstructions("❌ Error", error.message);
        this.hideLivenessStatus();
      });
      // Escuchar landmarks actualizados para dibujar malla facial
      this.addEventListener("landmarks-updated", (event) => {
        const landmarks = event.detail;
        this.drawFacialMesh(landmarks);
      });
      // 🔧 CORREGIDO: Escuchar eventos de gestos completados desde window
      const gestureCompletedHandler = (event) => {
        console.log("🎯 Evento gesture-completed recibido:", event.detail);
        const { gestureType, nextGesture } = event.detail;
        this.handleGestureCompleted(gestureType, nextGesture);
      };
      window.addEventListener("gesture-completed", gestureCompletedHandler);
      this.windowEventListeners.push({
        event: "gesture-completed",
        handler: gestureCompletedHandler,
      });
      // 🔧 NUEVO: Escuchar evento de todos los gestos completados
      const allGesturesCompletedHandler = (event) => {
        console.log(
          "🎉 Evento recibido: todos los gestos completados (fase actual:",
          this.currentPhase,
          ", procesado:",
          this.gesturesCompletedProcessed,
          ")"
        );
        // 🔧 PREVENIR EVENTOS DUPLICADOS - Verificar PRIMERO
        if (this.gesturesCompletedProcessed) {
          console.log(
            "⚠️ Evento de gestos completados ya procesado, ignorando..."
          );
          return;
        }
        // 🔧 CRÍTICO: Si estamos en fase 'button', ignorar el evento completamente
        // Esto significa que esta instancia NO está en proceso de liveness
        // (probablemente es otra instancia del componente la que está procesando)
        if (this.currentPhase === "button") {
          console.log(
            "⚠️ Instancia en fase button, ignorando evento (probablemente es para otra instancia)"
          );
          return;
        }
        // 🎯 REFACTORIZADO: En sistema de fases, NO llamar a handleAllGesturesCompleted
        // porque detiene la cámara. En su lugar, solo transicionar a fase capture
        if (
          this.currentPhase === "liveness" ||
          this.currentPhase === "capture"
        ) {
          // Marcar como procesado INMEDIATAMENTE para prevenir procesamiento duplicado
          this.gesturesCompletedProcessed = true;
          // Si ya estamos en capture, no hacer nada más
          if (this.currentPhase === "capture") {
            console.log(
              "⚠️ Ya estamos en fase capture, ignorando evento duplicado"
            );
            return;
          }
          console.log(
            "🎯 Transicionando a fase capture desde all-gestures-completed"
          );
          // NO detener la cámara aquí, se necesita para capturar la foto
          // Solo detener el procesamiento de liveness
          this.stopProcessing();
          this.hideLivenessStatus();
          this.handleLivenessComplete();
          return; // IMPORTANTE: Retornar aquí para evitar que se llame a handleAllGesturesCompleted
        }
        // Sistema antiguo: usar el método completo (solo si NO estamos en sistema de fases)
        // Pero solo si NO estamos en button (ya verificado arriba)
        this.handleAllGesturesCompleted(event.detail);
      };
      window.addEventListener(
        "all-gestures-completed",
        allGesturesCompletedHandler
      );
      this.windowEventListeners.push({
        event: "all-gestures-completed",
        handler: allGesturesCompletedHandler,
      });
    }
    // 🔧 NUEVO: Método para actualizar la cámara con el progreso
    updateCameraWithProgress(progress) {
      if (!this.videoElement || !this.canvasElement) return;
      // Obtener el contexto del canvas
      const ctx = this.canvasElement.getContext("2d");
      if (!ctx) return;
      // Limpiar el canvas
      ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      // Dibujar el frame actual del video
      ctx.drawImage(
        this.videoElement,
        0,
        0,
        this.canvasElement.width,
        this.canvasElement.height
      );
      // 🔧 NUEVO: Mostrar el gesto actual en la cámara
      this.drawCurrentGestureIndicator(ctx, progress);
    }
    // 🔧 NUEVO: Dibujar indicador del gesto actual en la cámara
    drawCurrentGestureIndicator(ctx, progress) {
      if (!progress.currentGesture) return;
      const centerX = this.canvasElement.width / 2;
      const centerY = this.canvasElement.height / 2;
      // Configurar estilo del texto
      ctx.fillStyle = "#00ff00";
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      // Dibujar el gesto actual
      let gestureText = "";
      switch (progress.currentGesture) {
        case "blink":
          gestureText = "👁️ PARPADEA";
          break;
        case "smile":
          gestureText = "😊 SONRÍE";
          break;
        case "head_rotation":
          gestureText = "🔄 MUEVE LA CABEZA";
          break;
        default:
          gestureText = "🎯 PREPARATE";
      }
      // Dibujar texto con borde
      ctx.strokeText(gestureText, centerX, centerY - 50);
      ctx.fillText(gestureText, centerX, centerY - 50);
      // Dibujar progreso
      const progressText = `Progreso: ${Math.round(progress.progress * 100)}%`;
      ctx.strokeText(progressText, centerX, centerY + 50);
      ctx.fillText(progressText, centerX, centerY + 50);
    }
    showRegistrationModal() {
      this.configureModalForRegistration();
      this.modalOverlay.classList.add("show");
      this.nameInput.focus();
      this.currentProcess = "form";
      this.emitEvent("register-start");
    }
    hideRegistrationModal() {
      this.modalOverlay.classList.remove("show");
      this.currentProcess = "idle";
      this.clearForm();
    }
    // 🔧 ELIMINADO: Sistema antiguo de modales - ya no se usa
    // private showValidationModal(): void { ... }
    // private hideValidationModal(): void { ... }
    // 🔧 NUEVO: Configurar modal para registro
    configureModalForRegistration() {
      this.modalTitle.textContent = "Registro de Personal";
      this.modalSubtitle.textContent =
        "Complete la información requerida para el registro biométrico";
      this.registrationForm.style.display = "block";
      this.validationForm.style.display = "none";
      // Pre-llenar campos si las props están disponibles
      if (this.personName) {
        this.nameInput.value = this.personName;
        this.nameInput.classList.add("valid");
      }
      if (this.personId) {
        this.idInput.value = this.personId;
        this.idInput.classList.add("valid");
      }
    }
    // 🔧 ELIMINADO: Sistema antiguo de modales - ya no se usa
    // private configureModalForValidation(): void { ... }
    clearForm() {
      this.nameInput.value = "";
      this.emailInput.value = "";
      this.idInput.value = "";
      this.clearErrors();
    }
    // 🔧 NUEVO: Limpiar formulario de validación
    clearValidationForm() {
      this.validateIdInput.value = "";
      this.clearValidationErrors();
    }
    clearErrors() {
      this.nameInput.classList.remove("required", "valid");
      this.emailInput.classList.remove("required", "valid");
      this.idInput.classList.remove("required", "valid");
      document.querySelectorAll(".error-message").forEach((msg) => {
        msg.classList.remove("show");
      });
    }
    // 🔧 NUEVO: Limpiar errores de validación
    clearValidationErrors() {
      this.validateIdInput.classList.remove("required", "valid");
      this.shadowRoot
        ?.getElementById("validate-id-error")
        ?.classList.remove("show");
    }
    validateInput(input, errorId) {
      const errorElement = this.shadowRoot?.getElementById(errorId);
      const isValid = input.value.trim().length > 0;
      if (isValid) {
        input.classList.remove("required");
        input.classList.add("valid");
        if (errorElement) errorElement.classList.remove("show");
      } else {
        input.classList.remove("valid");
        input.classList.add("required");
        if (errorElement) errorElement.classList.add("show");
      }
    }
    validateEmail(input, errorId) {
      const errorElement = this.shadowRoot?.getElementById(errorId);
      const email = input.value.trim();
      if (email === "") {
        // Email is optional, so no error
        input.classList.remove("required", "valid");
        if (errorElement) errorElement.classList.remove("show");
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValid = emailRegex.test(email);
      if (isValid) {
        input.classList.remove("required");
        input.classList.add("valid");
        if (errorElement) errorElement.classList.remove("show");
      } else {
        input.classList.remove("valid");
        input.classList.add("required");
        if (errorElement) errorElement.classList.add("show");
      }
    }
    // 🔧 REFACTORIZADO: Manejar envío del formulario de registro (solo para modales, no usado en sistema de fases)
    async handleRegistrationSubmit() {
      // 🔧 NUEVO: Si estamos usando el sistema de fases, este método no debería ser llamado
      // El sistema de fases maneja el flujo automáticamente
      if (
        this.currentPhase !== "button" &&
        this.currentPhase !== "liveness_alert"
      ) {
        console.warn(
          "⚠️ handleRegistrationSubmit llamado fuera del flujo de modales, ignorando..."
        );
        return;
      }
      try {
        const name = this.nameInput?.value?.trim() || "";
        const email = this.emailInput?.value?.trim() || "";
        const id = this.idInput?.value?.trim() || "";
        // Validate required fields
        let hasErrors = false;
        if (!name) {
          this.nameInput?.classList.add("required");
          this.shadowRoot?.getElementById("name-error")?.classList.add("show");
          hasErrors = true;
        }
        if (!id) {
          this.idInput?.classList.add("required");
          this.shadowRoot?.getElementById("id-error")?.classList.add("show");
          hasErrors = true;
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          this.emailInput?.classList.add("required");
          this.shadowRoot?.getElementById("email-error")?.classList.add("show");
          hasErrors = true;
        }
        if (hasErrors) {
          return;
        }
        // Usar valores de props si están disponibles, sino usar valores del formulario
        const finalName = this.personName || name;
        const finalId = this.personId || id;
        // Guardar datos del usuario
        this.currentUserData = {
          name: finalName,
          email: email || undefined,
          id: finalId,
        };
        // Ocultar modal si existe
        this.hideRegistrationModal();
        // 🔧 REFACTORIZADO: Transicionar a liveness_alert para mostrar instrucciones
        console.log("✅ Datos de registro capturados:", this.currentUserData);
        this.changePhase("liveness_alert");
      } catch (error) {
        console.error("❌ Error en el flujo de registro:", error);
        this.emitError(
          "REGISTRATION_FAILED",
          error instanceof Error ? error.message : "Error desconocido"
        );
        this.changePhase("error");
      }
    }
    // 🔧 REFACTORIZADO: Manejar envío del formulario de validación (solo para modales, no usado en sistema de fases)
    async handleValidationSubmit() {
      // 🔧 NUEVO: Si estamos usando el sistema de fases, este método no debería ser llamado
      // El sistema de fases maneja el flujo automáticamente a través de handleIdentitySubmit
      if (
        this.currentPhase !== "button" &&
        this.currentPhase !== "identity_input"
      ) {
        console.warn(
          "⚠️ handleValidationSubmit llamado fuera del flujo de modales, ignorando..."
        );
        return;
      }
      const validateId = this.validateIdInput?.value?.trim() || "";
      if (!validateId) {
        this.validateIdInput?.classList.add("required");
        this.shadowRoot
          ?.getElementById("validate-id-error")
          ?.classList.add("show");
        return;
      }
      try {
        // Usar valores de props si están disponibles, sino usar valores del formulario
        const finalId = this.personId || validateId;
        const finalName = this.personName || "";
        // Guardar datos del usuario
        this.currentUserData = { id: finalId, name: finalName };
        // 🔧 REFACTORIZADO: Si estamos en sistema de fases, cambiar a fase liveness
        if (
          this.currentPhase === "button" ||
          this.currentPhase === "identity_input"
        ) {
          this.changePhase("liveness");
          // La cámara se iniciará automáticamente en setupCameraForLiveness
          await this.setupCameraForLiveness();
        }
      } catch (error) {
        console.error("❌ Error en el flujo de validación:", error);
        this.emitError(
          "VALIDATION_FAILED",
          error instanceof Error ? error.message : "Error desconocido"
        );
        this.changePhase("error");
      }
    }
    // Public method to set user data programmatically
    setUserData(userData) {
      console.log("💾 setUserData llamado con:", userData);
      // 🔧 CORREGIDO: Guardar en instancia local Y global
      this.currentUserData = userData;
      SfiFacial._globalUserData = userData;
      console.log(
        "💾 currentUserData después de setear:",
        this.currentUserData
      );
      console.log("💾 Datos globales actualizados:", SfiFacial._globalUserData);
      this.currentProcess = "camera";
      this.emitEvent("register-form-submitted", userData);
      this.emitEvent("register-camera-ready");
    }
    // 🔧 MEJORADO: Método para registrar con API con reintentos automáticos
    async registerWithAPI(images) {
      if (!images || images.length === 0) {
        throw new Error("No hay imágenes para registrar");
      }
      // 🔧 MEJORADO: Validación exhaustiva de imágenes antes de enviar
      const validatedImages = await this.validateImagesBeforeAPI(images);
      if (validatedImages.length === 0) {
        throw new Error(
          "No hay imágenes válidas para registrar después de la validación"
        );
      }
      const totalSize = validatedImages.reduce(
        (sum, img) => sum + img.length,
        0
      );
      const totalSizeMB = totalSize / (1024 * 1024);
      console.log(
        `📸 Enviando ${validatedImages.length} imágenes validadas a la API (${totalSizeMB.toFixed(2)}MB total)`
      );
      // 🔧 DEBUG: Log detallado de cada imagen antes del envío
      validatedImages.forEach((img, index) => {
        console.log(`🔍 Imagen ${index + 1} antes del envío:`, {
          length: img.length,
          startsWithData: img.startsWith("data:image/"),
          first100Chars: img.substring(0, 100),
          last100Chars: img.substring(img.length - 100),
        });
      });
      const payload = {
        person_id: this.currentUserData?.id || "unknown",
        person_name: this.currentUserData?.name || "Unknown User",
        images_base64: validatedImages,
        person_email: this.currentUserData?.email,
        metadata: {
          source: "sfi-facial-component",
          timestamp: new Date().toISOString(),
          image_count: validatedImages.length,
          total_size_bytes: totalSize,
          component_version: "1.0.0",
          liveness_gestures: this.capturedPhotos.map((p) => p.gestureType),
        },
      };
      const url = `${this.apiUrl}/register_person`;
      console.log(`🌐 Haciendo petición a: ${url}`);
      console.log(`⏱️ Timeout configurado: ${this.apiTimeout}ms`);
      // 🔧 NUEVO: Cerrar cámara inmediatamente después de enviar petición
      console.log("📹 Cerrando cámara - ya no se necesita para el registro");
      this.stopCamera();
      // 🔧 MEJORADO: Implementar retry automático con backoff exponencial
      const maxRetries = 3;
      let lastError = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 Intento ${attempt}/${maxRetries} de registro con API...`
          );
          const response = await this.makeAPIRequest(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            const result = await response.json();
            console.log(
              `✅ Registro exitoso en API (intento ${attempt}):`,
              result
            );
            return result;
          } else {
            const errorText = await response.text();
            lastError = new Error(
              `API respondió con error ${response.status}: ${errorText}`
            );
            console.warn(`⚠️ Intento ${attempt} falló: ${lastError.message}`);
          }
        } catch (error) {
          lastError = error;
          console.warn(`⚠️ Intento ${attempt} falló: ${error}`);
          // Si no es el último intento, esperar antes del siguiente
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 6s
            console.log(
              `⏳ Esperando ${waitTime / 1000}s antes del siguiente intento...`
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }
      // 🔧 MEJORADO: Si todos los intentos fallaron, usar fallback local
      console.warn(
        `🔄 API no disponible después de ${maxRetries} intentos, guardando registro localmente como fallback...`
      );
      try {
        const localResult = await this.storageService.saveUser({
          userData: {
            id: this.currentUserData?.id || "unknown",
            name: this.currentUserData?.name || "Unknown User",
            email: this.currentUserData?.email,
          },
          faceData: {
            landmarks: [],
            image: validatedImages[0],
            photos: validatedImages.map((img, index) => ({
              index: index + 1,
              data: img,
              timestamp: Date.now(),
            })),
            timestamp: Date.now(),
            livenessScore: 1.0,
          },
        });
        console.log(`✅ Usuario guardado localmente como fallback`);
        return {
          success: true,
          stored_locally: true,
          message: "Guardado localmente",
          local_data: localResult,
        };
      } catch (fallbackError) {
        console.error(`❌ Error en fallback local:`, fallbackError);
        throw new Error(
          `API no disponible y fallback local falló: ${lastError?.message || "Unknown error"}`
        );
      }
    }
    /**
     * 🔧 NUEVO: Valida imágenes antes de enviarlas a la API
     */
    async validateImagesBeforeAPI(images) {
      const validatedImages = [];
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          // Validar formato base64
          if (!image.startsWith("data:image/")) {
            console.warn(`⚠️ Imagen ${i + 1}: No es un data URL válido`);
            continue;
          }
          // Validar tamaño mínimo
          if (image.length < 10000) {
            console.warn(
              `⚠️ Imagen ${i + 1}: Muy pequeña (${image.length} caracteres)`
            );
            continue;
          }
          // Validar que no sea una imagen de prueba corrupta
          if (this.isTestImage(image)) {
            console.warn(
              `⚠️ Imagen ${i + 1}: Es una imagen de prueba corrupta`
            );
            continue;
          }
          // Validar que tenga contenido real
          if (await this.validateImageContent(image)) {
            validatedImages.push(image);
            console.log(
              `✅ Imagen ${i + 1} validada: ${Math.round(image.length / 1024)}KB`
            );
          } else {
            console.warn(`⚠️ Imagen ${i + 1}: No pasa validación de contenido`);
          }
        } catch (error) {
          console.warn(`⚠️ Error validando imagen ${i + 1}:`, error);
        }
      }
      console.log(
        `📊 Validación completada: ${validatedImages.length}/${images.length} imágenes válidas`
      );
      return validatedImages;
    }
    /**
     * 🔧 NUEVO: Detecta si es una imagen de prueba corrupta
     */
    isTestImage(image) {
      // Detectar imágenes de prueba conocidas que causan problemas
      const suspiciousPatterns = [
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
      ];
      return suspiciousPatterns.some((pattern) => image.includes(pattern));
    }
    /**
     * 🔧 NUEVO: Valida que la imagen tenga contenido real
     */
    async validateImageContent(image) {
      return new Promise((resolve) => {
        try {
          const img = new Image();
          img.onload = () => {
            // Verificar dimensiones mínimas
            if (img.width < 100 || img.height < 100) {
              console.warn(
                `⚠️ Imagen tiene dimensiones insuficientes: ${img.width}x${img.height}`
              );
              resolve(false);
              return;
            }
            // Verificar que no sea completamente transparente
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(false);
              return;
            }
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );
            const hasContent = this.checkImageHasContent(imageData);
            resolve(hasContent);
          };
          img.onerror = () => {
            console.warn(`⚠️ Error cargando imagen para validación`);
            resolve(false);
          };
          img.src = image;
        } catch (error) {
          console.warn(`⚠️ Error en validación de imagen:`, error);
          resolve(false);
        }
      });
    }
    // 🔧 MEJORADO: Método robusto para llamadas a API con timeout y manejo de errores
    async makeAPIRequest(url, options) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.apiTimeout);
      try {
        console.log(`🌐 Haciendo petición a: ${url}`);
        console.log(`⏱️ Timeout configurado: ${this.apiTimeout}ms`);
        // 🔧 NUEVO: Verificar conectividad antes de hacer la petición
        if (!navigator.onLine) {
          throw new Error(
            "🌐 Sin conexión a internet. Verifica tu conexión de red."
          );
        }
        // 🔧 NUEVO: Intentar conectar primero para verificar que la API esté disponible
        try {
          const testResponse = await fetch(`${this.apiBaseUrl}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000), // 5 segundos para health check
          });
          if (!testResponse.ok) {
            throw new Error(
              `🔍 API no responde correctamente (${testResponse.status})`
            );
          }
          console.log("✅ Health check exitoso, API está disponible");
        } catch (healthError) {
          console.warn(
            "⚠️ Health check falló, pero continuando con la petición principal:",
            healthError
          );
        }
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          if (response.status >= 500) {
            throw new Error(
              `Error del servidor (${response.status}): ${response.statusText}`
            );
          } else if (response.status === 404) {
            throw new Error(
              `Endpoint no encontrado (${response.status}): Verifica la URL de la API`
            );
          } else if (response.status === 401 || response.status === 403) {
            throw new Error(
              `Error de autenticación (${response.status}): ${response.statusText}`
            );
          } else {
            throw new Error(
              `Error en la API (${response.status}): ${response.statusText}`
            );
          }
        }
        console.log(`✅ Respuesta exitosa de API: ${response.status}`);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            throw new Error(
              `⏱️ Timeout: La API no respondió en ${this.apiTimeout / 1000} segundos. Verifica la conexión y que la API esté ejecutándose.`
            );
          } else if (error.message.includes("fetch")) {
            throw new Error(
              `🌐 Error de conexión: No se puede conectar con la API en ${url}. Verifica que esté activa y accesible.`
            );
          } else if (error.message.includes("Failed to fetch")) {
            throw new Error(
              `🌐 Error de red: No se puede alcanzar la API. Verifica la URL y que el servidor esté ejecutándose.`
            );
          }
        }
        throw error;
      }
    }
    // 🔧 MEJORADO: Método para validar con API con reintentos automáticos
    async validateWithAPI(personId, image) {
      // 🔧 NUEVO: Validar que la imagen sea válida
      if (!image || image.length < 5000) {
        throw new Error(
          "La imagen proporcionada no es válida o es demasiado pequeña"
        );
      }
      const requestData = {
        person_id: personId,
        image_base64: image,
      };
      // 🔧 NUEVO: Cerrar cámara inmediatamente después de enviar petición
      console.log(
        "📹 Cerrando cámara - ya no se necesita para la validación con API"
      );
      this.stopCamera();
      // 🔧 NUEVO: Reintentos automáticos para validación
      const maxRetries = 3;
      let lastError = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 Intento ${attempt}/${maxRetries} de validación con API`
          );
          const response = await this.makeAPIRequest(
            `${this.apiBaseUrl}/validate_identity`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestData),
            }
          );
          const result = await response.json();
          console.log(`✅ Validación exitosa en intento ${attempt}:`, result);
          // Emitir evento según el resultado
          if (result.is_match || result.isMatch) {
            this.emitEvent("validate-success", result);
            // 🔧 CORREGIDO: Transicionar a fase complete después de validación exitosa
            this.changePhase("complete");
          } else {
            this.emitEvent("validate-failed", result);
            // 🔧 CORREGIDO: Transicionar a fase complete después de validación fallida
            this.changePhase("complete");
          }
          return result;
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error("Error desconocido");
          console.error(
            `❌ Error en intento ${attempt}/${maxRetries} de validación:`,
            lastError
          );
          // Si no es el último intento, esperar antes de reintentar
          if (attempt < maxRetries) {
            const waitTime = attempt * 2000; // Esperar 2s, 4s, 6s
            console.log(
              `⏳ Esperando ${waitTime / 1000}s antes del siguiente intento de validación...`
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }
      // 🔧 MEJORADO: Si todos los intentos fallaron, usar fallback local
      console.error(
        "❌ Todos los intentos de validación con API fallaron, usando fallback local"
      );
      try {
        // 🔧 FALLBACK: Usar validación local si la API falla
        const errorMessage =
          lastError instanceof Error
            ? lastError.message
            : "Error desconocido en la API";
        if (
          errorMessage.includes("timeout") ||
          errorMessage.includes("conexión") ||
          errorMessage.includes("Failed to fetch")
        ) {
          console.log(
            "🔄 API no disponible después de reintentos, intentando validación local como fallback..."
          );
          // Intentar validación local
          // 🔧 CORREGIDO: Crear objetos FaceData para la comparación local
          const storedUser = this.storageService.getUserById(personId);
          if (!storedUser) {
            throw new Error(
              `Usuario con ID "${personId}" no encontrado en almacenamiento local`
            );
          }
          const capturedFaceData = {
            landmarks: [],
            image: image,
            photos: [
              {
                index: 1,
                data: image,
                timestamp: Date.now(),
              },
            ],
            timestamp: Date.now(),
            livenessScore: 1.0,
          };
          const localResult = await this.facialComparison.comparefaces(
            storedUser.faceData,
            capturedFaceData
          );
          console.log(
            "✅ Validación local exitosa como fallback:",
            localResult
          );
          // Emitir evento según el resultado local
          if (localResult.isMatch) {
            this.emitEvent("validate-success", {
              ...localResult,
              source: "local-fallback",
            });
            // 🔧 CORREGIDO: Transicionar a fase complete después de validación local exitosa
            this.changePhase("complete");
          } else {
            this.emitEvent("validate-failed", {
              ...localResult,
              source: "local-fallback",
            });
            // 🔧 CORREGIDO: Transicionar a fase complete después de validación local fallida
            this.changePhase("complete");
          }
          return { ...localResult, source: "local-fallback", api_failed: true };
        }
        // Si no es un error de conexión, re-lanzar el error
        throw lastError;
      } catch (fallbackError) {
        console.error(
          "❌ Error en fallback local de validación:",
          fallbackError
        );
        throw new Error(
          `No se pudo validar ni con la API ni localmente: ${lastError?.message}`
        );
      }
    }
    // Public method to submit registration form (for programmatic use)
    submitRegistrationForm(userData) {
      this.currentUserData = userData;
      this.currentProcess = "camera";
      this.emitEvent("register-form-submitted", userData);
      this.emitEvent("register-camera-ready");
    }
    // 🔧 REFACTORIZADO: Usar CameraManager
    initializeVideoAndCanvas() {
      if (this.cameraManager) {
        this.cameraManager.initializeVideoAndCanvas();
        // Actualizar referencias locales
        this.videoElement = this.cameraManager.getVideoElement();
        this.canvasElement = this.cameraManager.getCanvasElement();
        this.canvasContext = this.cameraManager.getCanvasContext();
      } else {
        console.warn("⚠️ CameraManager no inicializado, usando método antiguo");
        // Fallback si CameraManager no está inicializado
        try {
          if (!this.videoElement) {
            this.videoElement = this.shadowRoot?.querySelector(".sfi-video");
          }
          if (!this.canvasElement) {
            this.canvasElement = this.shadowRoot?.querySelector(".sfi-canvas");
            if (this.canvasElement) {
              this.canvasElement.width = 640;
              this.canvasElement.height = 480;
            }
          }
          if (!this.canvasContext && this.canvasElement) {
            this.canvasContext = this.canvasElement.getContext("2d");
          }
        } catch (error) {
          console.error(
            "❌ Error reinicializando elementos de video y canvas:",
            error
          );
        }
      }
    }
    // Public method to setup camera
    // 🔧 REFACTORIZADO: Usar CameraManager
    async setupCamera(videoElement) {
      if (!this.cameraManager) {
        console.warn("⚠️ CameraManager no inicializado, inicializando...");
        this.cameraManager = new CameraManager(
          this.cameraService,
          this.shadowRoot,
          {
            onCameraStarted: () => {
              console.log("✅ Cámara iniciada desde CameraManager");
            },
            onCameraStopped: () => {
              console.log("✅ Cámara detenida desde CameraManager");
            },
            onPhotoCaptured: (photoData) => {
              console.log("✅ Foto capturada desde CameraManager:", photoData);
            },
            onError: (error) => {
              this.emitError("CAMERA_ERROR", error.message);
            },
            emitError: (code, message) => {
              this.emitError(code, message);
            },
          }
        );
      }
      const result = await this.cameraManager.setupCamera(videoElement);
      if (result) {
        // Establecer el estado del proceso a 'camera' para que startLivenessDetection funcione
        this.currentProcess = "camera";
        // Actualizar referencias locales
        this.videoElement = this.cameraManager.getVideoElement();
        this.canvasElement = this.cameraManager.getCanvasElement();
        this.canvasContext = this.cameraManager.getCanvasContext();
        // Iniciar renderizado automático de la malla facial
        this.startAutomaticRendering();
      }
      return result;
    }
    // Iniciar renderizado automático de malla facial usando MediaPipe Real
    startAutomaticRendering() {
      console.log("🎬 Iniciando renderizado automático con MediaPipe Real...");
      if (this.renderingInterval) {
        clearInterval(this.renderingInterval);
      }
      this.renderingInterval = window.setInterval(async () => {
        try {
          // Obtener landmarks del MediaPipe Real Service
          const landmarks =
            this.livenessDetector.mediaPipeService?.getLastLandmarks() || [];
          if (landmarks.length > 0 && this.canvasElement) {
            // Pasar los landmarks del primer rostro (array de 478 puntos)
            const faceLandmarks = Array.isArray(landmarks[0])
              ? landmarks[0]
              : landmarks;
            // Verificar que el canvas esté configurado correctamente
            if (
              this.canvasElement.width === 0 ||
              this.canvasElement.height === 0
            ) {
              this.canvasElement.width = 640;
              this.canvasElement.height = 480;
            }
            // 🎬 USAR MÉTODO CON EFECTOS VISUALES SCI-FI
            this.drawFacialMesh(faceLandmarks);
          }
        } catch (error) {
          console.warn("Error en renderizado automático:", error);
        }
      }, this.config.system.processingInterval || 150); // Usar configuración del proyecto de referencia
    }
    // Renderizar malla facial automáticamente
    renderFacialMesh() {
      if (!this.canvasContext || !this.canvasElement) {
        console.warn("❌ No hay canvas context o element");
        return;
      }
      const ctx = this.canvasContext;
      const canvas = this.canvasElement;
      // Limpiar canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Obtener landmarks
      const landmarks = this.getCurrentLandmarks();
      console.log(`🎯 Renderizando ${landmarks.length} landmarks`);
      if (landmarks.length === 0) {
        console.warn("❌ No hay landmarks para renderizar");
        return;
      }
      // DIBUJO SUPER SIMPLE QUE DEBE FUNCIONAR
      console.log(`🎨 Dibujando ${landmarks.length} landmarks - SUPER SIMPLE`);
      // Sin transformaciones complicadas - dibujo directo
      const time = Date.now() * 0.001;
      // Limpiar completamente
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Dibujar fondo para verificar que canvas funciona
      ctx.fillStyle = `rgba(255, 0, 0, ${0.1 + Math.sin(time) * 0.05})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Dibujar círculo que se mueve SIEMPRE (independiente de landmarks)
      const circleX = canvas.width * (0.5 + Math.sin(time * 2) * 0.3);
      const circleY = canvas.height * (0.5 + Math.cos(time * 1.5) * 0.2);
      ctx.fillStyle = "#FF00FF";
      ctx.beginPath();
      ctx.arc(circleX, circleY, 20, 0, 2 * Math.PI);
      ctx.fill();
      console.log(
        `🔥 Círculo dibujado en (${circleX.toFixed(0)}, ${circleY.toFixed(0)})`
      );
      // ===== DIBUJAR TODOS LOS LANDMARKS COMO MALLA FACIAL COMPLETA =====
      // 1. Dibujar conexiones entre landmarks (malla facial)
      ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
      ctx.lineWidth = 1;
      // Contorno facial (landmarks 0-16)
      this.drawLandmarkConnections(
        ctx,
        landmarks,
        canvas,
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
      );
      // Ojo izquierdo (landmarks 33-42)
      this.drawLandmarkConnections(
        ctx,
        landmarks,
        canvas,
        [
          33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160,
          161, 246, 33,
        ]
      );
      // Ojo derecho (landmarks 362-383)
      this.drawLandmarkConnections(
        ctx,
        landmarks,
        canvas,
        [
          362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385,
          384, 398, 362,
        ]
      );
      // Boca externa (landmarks principales)
      this.drawLandmarkConnections(
        ctx,
        landmarks,
        canvas,
        [
          61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 402, 317, 14,
          87, 178, 88, 95, 61,
        ]
      );
      // Boca interna
      this.drawLandmarkConnections(
        ctx,
        landmarks,
        canvas,
        [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 78]
      );
      // Nariz
      this.drawLandmarkConnections(
        ctx,
        landmarks,
        canvas,
        [
          1, 2, 5, 4, 6, 168, 8, 9, 10, 151, 195, 197, 196, 3, 51, 48, 115, 131,
          134, 102, 48, 64,
        ]
      );
      // 2. Dibujar todos los landmarks como puntos
      landmarks.forEach((landmark, index) => {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;
        // Verificar que las coordenadas son válidas
        if (
          isNaN(x) ||
          isNaN(y) ||
          x < 0 ||
          x > canvas.width ||
          y < 0 ||
          y > canvas.height
        ) {
          return;
        }
        // Diferentes colores para diferentes regiones
        let color = "#00FF00"; // Verde por defecto
        let size = 1;
        if (index >= 0 && index <= 16) {
          color = "#FF0000"; // Rojo para contorno facial
          size = 2;
        } else if (
          (index >= 33 && index <= 42) ||
          (index >= 362 && index <= 383)
        ) {
          color = "#0099FF"; // Azul para ojos
          size = 2;
        } else if (index >= 61 && index <= 84) {
          color = "#FF6600"; // Naranja para boca
          size = 2;
        } else if (index >= 1 && index <= 10) {
          color = "#FFFF00"; // Amarillo para nariz
          size = 2;
        }
        // Dibujar el punto
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
      });
      console.log("✅ Dibujo super simple completado");
    }
    drawLandmarkConnections(ctx, landmarks, canvas, indices) {
      if (indices.length < 2) return;
      ctx.beginPath();
      // Mover al primer punto
      const first = landmarks[indices[0]];
      if (first) {
        ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
      }
      // Conectar todos los puntos
      for (let i = 1; i < indices.length; i++) {
        const landmark = landmarks[indices[i]];
        if (landmark && !isNaN(landmark.x) && !isNaN(landmark.y)) {
          ctx.lineTo(landmark.x * canvas.width, landmark.y * canvas.height);
        }
      }
      ctx.stroke();
    }
    // Public method to start liveness detection
    async startLivenessDetection() {
      if (this.currentProcess !== "camera") {
        this.emitError("INVALID_STATE", "No hay proceso de cámara activo");
        return;
      }
      try {
        // Reiniciar efectos visuales
        this.analysisProgress = 0;
        this.scanLinePosition = 0;
        this._processing = true;
        this.updateButton();
        this.currentProcess = "processing";
        // Emitir evento de inicio
        this.emitEvent("liveness-started");
        // Iniciar liveness en background (no bloquear)
        this.runLivenessDetectionInBackground();
      } catch (error) {
        this._processing = false;
        this.updateButton();
        this.emitError(
          "LIVENESS_ERROR",
          error instanceof Error
            ? error.message
            : "Error en detección de liveness"
        );
      }
    }
    // Private method to run liveness detection in background
    async runLivenessDetectionInBackground() {
      try {
        const result = await this.runLivenessDetection();
        if (result.isLive) {
          // Get MediaPipe service from liveness detector to access landmarks
          const mediaPipeService = this.livenessDetector.mediaPipeService;
          const lastLandmarks = mediaPipeService?.getLastLandmarks() || [];
          const faceData = {
            landmarks: lastLandmarks,
            image: this.cameraService.captureImage() || "",
            timestamp: Date.now(),
            livenessScore: result.overallScore,
          };
          const registrationData = {
            userData: this.currentUserData,
            faceData,
          };
          // Save to storage
          this.storageService.saveUser(registrationData);
          this._processing = false;
          this.currentProcess = "idle";
          this.updateButton();
          this.emitEvent("register-liveness-complete", faceData);
          this.emitEvent("register-success", registrationData);
        } else {
          this.emitError("LIVENESS_FAILED", "No se detectó una persona real");
        }
      } catch (error) {
        this._processing = false;
        this.updateButton();
        this.emitError(
          "LIVENESS_ERROR",
          error instanceof Error
            ? error.message
            : "Error en detección de liveness"
        );
      }
    }
    // Public method to start validation
    startValidation() {
      if (this._processing) return;
      this.currentProcess = "form";
      this.emitEvent("validate-start");
    }
    // Public method to submit validation ID
    submitValidationId(id) {
      if (this.currentProcess !== "form") {
        this.emitError("INVALID_STATE", "No hay proceso de validación activo");
        return;
      }
      if (!id) {
        this.emitError("VALIDATION_ERROR", "ID es requerido");
        return;
      }
      this.currentProcess = "camera";
      this.emitEvent("validate-camera-ready", { id });
    }
    // Public method to start validation liveness
    async startValidationLiveness(id) {
      if (this.currentProcess !== "camera") {
        this.emitError("INVALID_STATE", "No hay proceso de cámara activo");
        return;
      }
      try {
        this._processing = true;
        this.updateButton();
        this.currentProcess = "processing";
        // Get stored user data
        const storedUser = this.storageService.getUserById(id);
        if (!storedUser) {
          this.emitError("USER_NOT_FOUND", "Usuario no encontrado");
          return;
        }
        // Run liveness detection on current face
        const livenessResult = await this.runLivenessDetection();
        if (!livenessResult.isLive) {
          this.emitError("LIVENESS_FAILED", "No se detectó una persona real");
          return;
        }
        // Capture current face data
        const capturedFaceData = {
          landmarks: [], // Will be filled by liveness detection
          image: this.cameraService.captureImage() || "",
          timestamp: Date.now(),
          livenessScore: livenessResult.overallScore,
        };
        // Compare with stored face
        const comparisonResult = this.facialComparison.comparefaces(
          storedUser.faceData,
          capturedFaceData
        );
        // Update last validation time
        if (comparisonResult.isMatch) {
          this.storageService.updateLastValidation(id);
        }
        this._processing = false;
        this.currentProcess = "idle";
        this.updateButton();
        this.emitEvent("validate-complete", {
          isMatch: comparisonResult.isMatch,
          confidence: comparisonResult.confidence,
          storedUser,
          capturedFaceData,
        });
      } catch (error) {
        this._processing = false;
        this.updateButton();
        this.emitError(
          "VALIDATION_ERROR",
          error instanceof Error ? error.message : "Error en validación"
        );
      }
    }
    // Private method to run liveness detection
    async runLivenessDetection() {
      if (!this.videoElement) {
        throw new Error("No hay elemento de video configurado");
      }
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 300; // 30 seconds at 100ms intervals
        // Start liveness session
        this.livenessDetector.startSession();
        this.processingInterval = window.setInterval(async () => {
          try {
            attempts++;
            // Process current frame
            const result = await this.livenessDetector.processFrame(
              this.videoElement
            );
            if (result) {
              // Check if all gestures are completed
              const progress = this.livenessDetector.getProgress();
              // DEBUG: Mostrar progreso actual
              console.log(
                `📊 Progreso actual: ${progress.progress * 100}% (${progress.completedGestures.length}/${progress.completedGestures.length + progress.currentGesture ? 1 : 0})`
              );
              if (progress.progress >= 1) {
                // Todos los gestos completados
                console.log(
                  "✅ Todos los gestos completados, finalizando liveness detection"
                );
                // IMPORTANTE: Obtener resultado ANTES de detener
                const finalResult = this.livenessDetector.getResult();
                console.log(
                  "🎯 Resultado obtenido antes de detener:",
                  finalResult
                );
                this.updateInstructions(
                  "📸 Capturando foto final...",
                  "Mantenga el rostro estable"
                );
                this.capturePhotoForGesture("final"); // Capturar la foto final aquí
                // Detener procesamiento (la cámara se detendrá en la fase 'complete')
                this.stopProcessing();
                this.hideLivenessStatus();
                if (finalResult) {
                  console.log("🎯 Resultado final de liveness:", finalResult);
                  resolve({
                    isLive: finalResult.isLive,
                    overallScore: finalResult.overallScore,
                    gestures: {
                      blink: finalResult.completedGestures.some(
                        (g) => g.type === "blink"
                      ),
                      smile: finalResult.completedGestures.some(
                        (g) => g.type === "smile"
                      ),
                      headMovement: finalResult.completedGestures.some(
                        (g) => g.type === "head_rotation"
                      ),
                    },
                  });
                } else {
                  console.log("❌ No se obtuvo resultado final de liveness");
                  resolve({
                    isLive: false,
                    overallScore: 0,
                    gestures: {
                      blink: false,
                      smile: false,
                      headMovement: false,
                    },
                  });
                }
                return;
              }
              // Emit progress update
              this.emitEvent("liveness-progress", progress);
            }
            // Check if max attempts reached
            if (attempts >= maxAttempts) {
              this.stopProcessing();
              resolve({
                isLive: false,
                overallScore: 0,
                gestures: {
                  blink: false,
                  smile: false,
                  headMovement: false,
                },
              });
              return;
            }
          } catch (error) {
            this.stopProcessing();
            reject(error);
          }
        }, 100); // Process every 100ms
      });
    }
    // Public method to stop processing
    stopProcessing() {
      console.log(
        "🛑 stopProcessing() llamado - SOLO deteniendo procesamiento, NO la cámara"
      );
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }
      this.livenessDetector.stopSession();
      // 🔧 CRÍTICO: NO detener la cámara aquí, se necesita para captura
      // this.cameraService.stopCamera(); // COMENTADO - se detiene manualmente cuando sea necesario
      console.log(
        "✅ Procesamiento detenido, cámara sigue activa para captura"
      );
    }
    // Public method to stop camera
    // 🔧 REFACTORIZADO: Usar CameraManager
    stopCamera() {
      if (this.cameraManager) {
        this.cameraManager.stopCamera();
        // Actualizar referencias locales
        this.videoElement = null;
        this.canvasElement = null;
        this.canvasContext = null;
      } else {
        // Fallback si CameraManager no está inicializado
        this.stopProcessing();
        if (this.videoElement) {
          this.videoElement.style.display = "none";
          this.videoElement.pause();
          this.videoElement.srcObject = null;
          this.videoElement = null;
        }
        if (this.canvasElement) {
          this.canvasElement.style.display = "none";
          this.canvasElement.width = 0;
          this.canvasElement.height = 0;
          this.canvasElement = null;
        }
        if (this.canvasContext) {
          this.canvasContext = null;
        }
        this.cameraService.stopCamera();
      }
    }
    // 🔧 NUEVO: Método centralizado para limpiar todos los recursos
    cleanup() {
      console.log("🧹 Iniciando limpieza de recursos...");
      // 1. Detener todos los intervalos
      if (this.processingInterval !== null) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
        console.log("✅ Intervalo de procesamiento limpiado");
      }
      if (this.renderingInterval !== null) {
        clearInterval(this.renderingInterval);
        this.renderingInterval = null;
        console.log("✅ Intervalo de renderizado limpiado");
      }
      // 2. Detener la cámara y limpiar elementos de video
      this.stopCamera();
      // 3. Limpiar event listeners de window
      this.windowEventListeners.forEach(({ event, handler }) => {
        window.removeEventListener(event, handler);
        console.log(`✅ Listener de window '${event}' eliminado`);
      });
      this.windowEventListeners = [];
      // 4. Limpiar event listeners de elementos externos
      this.externalEventListeners.forEach(({ element, event, handler }) => {
        try {
          element.removeEventListener(event, handler);
          console.log(`✅ Listener externo '${event}' eliminado de elemento`);
        } catch (error) {
          console.warn(`⚠️ Error al eliminar listener externo:`, error);
        }
      });
      this.externalEventListeners = [];
      // 5. Detener servicios
      try {
        if (this.livenessDetector) {
          this.livenessDetector.stopSession();
          console.log("✅ LivenessDetector detenido");
        }
      } catch (error) {
        console.warn("⚠️ Error al detener LivenessDetector:", error);
      }
      try {
        if (this.cameraService) {
          this.cameraService.stopCamera();
          console.log("✅ CameraService detenido");
        }
      } catch (error) {
        console.warn("⚠️ Error al detener CameraService:", error);
      }
      // 6. Limpiar referencias a elementos del DOM
      this.videoElement = null;
      this.canvasElement = null;
      this.canvasContext = null;
      // 7. Resetear estado
      this.currentPhase = "button";
      this.livenessCompleted = false;
      this.cameraInitializing = false;
      this.gesturesCompletedProcessed = false;
      this.capturedPhotos = [];
      console.log("✅ Limpieza de recursos completada");
    }
    // Public method to get camera capabilities
    async getCameraCapabilities() {
      return await this.cameraService.getCameraCapabilities();
    }
    // Public method to get current liveness progress
    getCurrentLivenessProgress() {
      return this.livenessDetector.getProgress();
    }
    // Public method to update liveness config
    updateLivenessConfig(config) {
      this.livenessDetector.updateConfig(config);
    }
    // Public method to get liveness config
    getLivenessConfig() {
      return this.livenessDetector.getConfig();
    }
    // Public method to set required gestures
    setRequiredGestures(gestures) {
      this.livenessDetector.updateConfig({ requiredGestures: gestures });
    }
    // Public method to get gesture instructions
    getGestureInstructions() {
      const progress = this.livenessDetector.getProgress();
      const instructions = {};
      this.livenessDetector
        .getConfig()
        .requiredGestures.forEach((gestureType) => {
          instructions[gestureType] =
            progress.gestureDetails[gestureType]?.instruction || "";
        });
      return instructions;
    }
    // Public method to get stored users
    getStoredUsers() {
      return this.storageService.getAllUsers().map((user) => user.userData);
    }
    // Public method to clear stored data
    clearStoredData() {
      this.storageService.clearAllUsers();
    }
    // Public method to get storage stats
    getStorageStats() {
      return this.storageService.getStorageStats();
    }
    // Public method to export data
    exportData() {
      return this.storageService.exportUsers();
    }
    // Public method to import data
    importData(jsonData) {
      return this.storageService.importUsers(jsonData);
    }
    // Iniciar flujo completo de registro automático
    async startCompleteRegistrationFlow() {
      try {
        // 🔧 RESETEAR estado para nuevo proceso
        this.gesturesCompletedProcessed = false;
        this.clearCapturedPhotos();
        console.log(`🚀 Iniciando flujo de REGISTRO (modo: ${this.mode})`);
        this.updateInstructions(
          "🚀 Iniciando registro...",
          "Configurando sistema de detección facial"
        );
        // 🔧 NUEVO: Lógica flexible para props vs modal
        if (!this.personName && !this.personId) {
          // Sin props: Generar datos simulados y mostrar modal
          const userData = {
            name: "Usuario Test",
            id: `user-${Date.now()}`,
            email: undefined,
          };
          console.log(
            "📝 Configurando userData simulado para registro:",
            userData
          );
          this.setUserData(userData);
          // Mostrar modal para confirmar/editar datos
          this.showRegistrationModal();
          return; // Salir aquí para mostrar modal
        } else {
          // Con props: Usar valores pero permitir edición opcional
          const userData = {
            name: this.personName || "Usuario Test",
            id: this.personId || `user-${Date.now()}`,
            email: undefined,
          };
          console.log(
            "📝 Configurando userData con props para registro:",
            userData
          );
          this.setUserData(userData);
          // 🔧 NUEVO: Preguntar si quiere editar o usar directamente
          const useDirectly = confirm(
            `¿Usar datos directamente?\n\nID: ${userData.id}\nNombre: ${userData.name}\n\nClick "OK" para usar directamente o "Cancel" para editar en el modal.`
          );
          if (useDirectly) {
            console.log("✅ Usando datos de props directamente");
            // Continuar con el flujo automático
          } else {
            console.log("📝 Mostrando modal para edición");
            this.showRegistrationModal();
            return; // Salir aquí para mostrar modal
          }
        }
        this.updateInstructions(
          "📷 Preparando cámara...",
          "Obteniendo acceso a la cámara"
        );
        // Configurar cámara automáticamente
        const cameraResult = await this.setupCamera();
        if (!cameraResult) {
          this.updateInstructions("❌ Error", "No se pudo acceder a la cámara");
          return;
        }
        this.updateInstructions(
          "🔍 Detectando rostro...",
          "Iniciando sistema de landmarks"
        );
        // Configurar gestos
        this.setRequiredGestures(["blink", "smile", "head_rotation"]);
        // Mostrar interfaz visual de liveness
        this.showLivenessStatus();
        this.updateGestureStatus("blink", "current");
        this.updateGestureStatus("smile", "pending");
        this.updateGestureStatus("head_rotation", "pending");
        this.updateInstructionText("👁️ Parpadea naturalmente para comenzar");
        // Iniciar liveness detection
        await this.startLivenessDetection();
        this.updateInstructions(
          "👁️ Parpadea naturalmente",
          "Realiza un parpadeo normal para continuar"
        );
      } catch (error) {
        this.updateInstructions(
          "❌ Error",
          `Error: ${error instanceof Error ? error.message : "Error desconocido"}`
        );
      }
    }
    // Iniciar flujo completo de validación automático
    async startCompleteValidationFlow() {
      try {
        // 🔧 RESETEAR estado para nuevo proceso
        this.gesturesCompletedProcessed = false;
        // 🔧 CORREGIDO: NO limpiar fotos en validación, se usan las existentes
        console.log(
          "🔍 Iniciando flujo de validación (fotos existentes preservadas)"
        );
        this.updateInstructions(
          "🔍 Iniciando validación...",
          "Preparando sistema de verificación"
        );
        // 🔧 CORREGIDO: NO mostrar modal inmediatamente, iniciar liveness primero
        // El modal se mostrará DESPUÉS de completar liveness y tomar la foto
        // 🔧 NUEVO: Lógica flexible para props vs modal en validación
        if (!this.personName && !this.personId) {
          // Sin props: Generar datos simulados y mostrar modal
          const userData = {
            name: "Usuario Validación",
            id: "temp-validation-id",
            email: undefined,
          };
          console.log(
            "📝 Configurando userData simulado para validación:",
            userData
          );
          this.setUserData(userData);
          // 🔧 ELIMINADO: Sistema antiguo de modales - usar solo el nuevo sistema de fases
          // this.showValidationModal();
          // return; // Salir aquí para mostrar modal
        } else {
          // Con props: Usar valores pero permitir edición opcional
          const userData = {
            name: this.personName || "Usuario Validación",
            id: this.personId || "temp-validation-id",
            email: undefined,
          };
          console.log(
            "📝 Configurando userData con props para validación:",
            userData
          );
          this.setUserData(userData);
          // 🔧 NUEVO: Preguntar si quiere usar el ID de las props o ingresar uno diferente
          const useDirectly = confirm(
            `¿Usar ID de validación directamente?\n\nID: ${userData.id}\nNombre: ${userData.name}\n\nClick "OK" para usar directamente o "Cancel" para ingresar un ID diferente.`
          );
          if (useDirectly) {
            console.log("✅ Usando ID de props directamente para validación");
            // Continuar con el flujo automático
          } else {
            console.log("📝 Mostrando modal para ingresar ID diferente");
            // 🔧 ELIMINADO: Sistema antiguo de modales - usar solo el nuevo sistema de fases
            // this.showValidationModal();
            // return; // Salir aquí para mostrar modal
          }
        }
        this.updateInstructions(
          "📷 Preparando cámara...",
          "Obteniendo acceso a la cámara"
        );
        // Configurar cámara automáticamente
        const cameraResult = await this.setupCamera();
        if (!cameraResult) {
          this.updateInstructions("❌ Error", "No se pudo acceder a la cámara");
          return;
        }
        this.updateInstructions(
          "🔍 Detectando rostro...",
          "Iniciando sistema de landmarks"
        );
        // Configurar gestos
        this.setRequiredGestures(["blink", "smile", "head_rotation"]);
        // Mostrar interfaz visual de liveness
        this.showLivenessStatus();
        this.updateGestureStatus("blink", "current");
        this.updateGestureStatus("smile", "pending");
        this.updateGestureStatus("head_rotation", "pending");
        this.updateInstructionText("👁️ Parpadea naturalmente para comenzar");
        // Iniciar liveness detection
        await this.startLivenessDetection();
        this.updateInstructions(
          "👁️ Parpadea naturalmente",
          "Realiza un parpadeo normal para continuar"
        );
      } catch (error) {
        this.updateInstructions(
          "❌ Error",
          `Error: ${error instanceof Error ? error.message : "Error desconocido"}`
        );
      }
    }
    // 🔧 CORREGIDO: Manejar comparación facial en validación - ENVIAR A API
    async handleValidationComparison() {
      try {
        this.updateInstructions(
          "🔄 Procesando...",
          "Enviando a API para validación"
        );
        // 🔧 DEBUG: Verificar datos de usuario
        console.log("🔍 currentUserData:", this.currentUserData);
        if (!this.currentUserData || !this.currentUserData.id) {
          console.error(
            "❌ Error: currentUserData no está disponible o no tiene ID"
          );
          throw new Error(
            "No hay datos de usuario para validar. El ID se perdió durante el proceso."
          );
        }
        // 🔧 CORREGIDO: La foto ya fue capturada ANTES de detener la cámara
        const photos = this.getCapturedPhotos();
        console.log(`📸 Verificando fotos capturadas: ${photos.length}`);
        if (photos.length === 0) {
          throw new Error("No se capturó ninguna foto durante la validación");
        }
        console.log(
          `🔄 Enviando validación a API para ID: ${this.currentUserData.id}`
        );
        console.log(
          `📸 Usando foto capturada (tamaño: ${photos[0].length} chars)`
        );
        // 🔧 CORRECTO: Enviar a API en lugar de comparación local
        const result = await this.validateWithAPI(
          this.currentUserData.id,
          photos[0]
        );
        console.log("✅ Respuesta de API:", result);
        // Mostrar resultado basado en respuesta de API
        this.showValidationResultFromAPI(result);
      } catch (error) {
        console.error("❌ Error en validación con API:", error);
        this.updateInstructions(
          "❌ Error de Validación",
          error instanceof Error
            ? error.message
            : "Error en la API de validación"
        );
        // Limpiar datos en caso de error
        this.currentUserData = null;
      }
    }
    // 🔧 NUEVO: Mostrar resultado de validación desde API
    showValidationResultFromAPI(result) {
      const isMatch = result.is_match || result.isMatch; // Flexible para diferentes formatos de API
      const confidence = result.confidence
        ? Math.round(result.confidence * 100)
        : 0;
      const personName = result.person_name || result.name || "Usuario";
      if (isMatch) {
        this.updateInstructions(
          "✅ Validación Exitosa",
          `Identidad confirmada: ${personName} (${confidence}% confianza)`
        );
        console.log("✅ Validación exitosa para:", personName);
      } else {
        this.updateInstructions(
          "❌ Validación Fallida",
          `Identidad no confirmada. Confianza: ${confidence}%`
        );
        console.log("❌ Validación fallida. Confianza:", confidence);
      }
      // Limpiar fotos capturadas
      this.clearCapturedPhotos();
      // Resetear estado (NO limpiar currentUserData hasta que termine completamente)
      this.currentProcess = "idle";
      // this.currentUserData = null; // 🔧 NO limpiar aquí, se limpia manualmente después
      this.updateButton();
    }
    // Actualizar instrucciones en pantalla
    updateInstructions(title, text, progress) {
      const titleElement = this.shadowRoot?.getElementById(
        "sfi-instruction-title"
      );
      const textElement = this.shadowRoot?.getElementById(
        "sfi-instruction-text"
      );
      const progressElement =
        this.shadowRoot?.getElementById("sfi-progress-fill");
      if (titleElement) titleElement.textContent = title;
      if (textElement) textElement.textContent = text;
      if (progressElement && progress !== undefined) {
        progressElement.style.width = `${progress}%`;
      }
    }
    // Actualizar instrucciones basado en progreso de liveness
    updateInstructionsFromProgress(progress) {
      if (!progress) return;
      const overallProgress = progress.progress * 100;
      let title = "";
      let text = progress.instruction || "";
      switch (progress.currentGesture) {
        case "blink":
          title = "👁️ Parpadeo";
          break;
        case "smile":
          title = "😊 Sonrisa";
          break;
        case "head_rotation":
          title = "🔄 Movimiento de Cabeza";
          break;
        default:
          title = "🎯 Detección de Gestos";
          break;
      }
      this.updateInstructions(title, text, overallProgress);
    }
    // 🔧 NUEVO FLUJO: Tomar foto después de completar liveness
    async takePhotoAfterLiveness() {
      try {
        console.log("📸 Iniciando captura de foto después de liveness...");
        // Limpiar fotos anteriores
        this.clearCapturedPhotos();
        // Configurar cámara para foto
        const cameraResult = await this.setupCamera();
        if (!cameraResult) {
          console.log(
            "❌ Error: No se pudo acceder a la cámara para tomar foto"
          );
          return;
        }
        // Esperar un momento para que la cámara se estabilice
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // Tomar foto de alta calidad
        console.log("📸 Tomando foto... Mantenga su rostro centrado y estable");
        // Tomar foto con máxima calidad
        const photoData = this.captureHighQualityPhoto();
        if (photoData) {
          console.log("✅ Foto capturada exitosamente:", photoData);
          console.log("✅ Foto capturada - Procesando y enviando a la API...");
          // 🔧 CORREGIDO: Enviar foto automáticamente al backend según el modo
          if (this.mode === "validate") {
            // Modo validación: mostrar modal para ID y luego enviar
            // 🔧 ELIMINADO: Sistema antiguo de modales - ya no se usa
            // this.showValidationModal();
          } else {
            // Modo registro: enviar directamente con datos automáticos
            await this.sendPhotoToBackend(photoData);
          }
          // Cambiar estado
          this.currentProcess = "form";
          this.updateButton();
        } else {
          console.log(
            "❌ Error: No se pudo capturar la foto. Intente nuevamente."
          );
        }
      } catch (error) {
        console.error("❌ Error tomando foto después de liveness:", error);
        console.log(
          "❌ Error:",
          error instanceof Error ? error.message : "Error desconocido"
        );
      }
    }
    // 🔧 NUEVO MÉTODO: Tomar foto para validación (modo especial)
    async takePhotoForValidation() {
      try {
        console.log("📸 Tomando foto para validación...");
        // Limpiar fotos anteriores
        this.clearCapturedPhotos();
        // Configurar cámara para foto
        const cameraResult = await this.setupCamera();
        if (!cameraResult) {
          console.log(
            "❌ Error: No se pudo acceder a la cámara para tomar foto"
          );
          return;
        }
        // Esperar un momento para que la cámara se estabilice
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // Tomar foto de alta calidad
        console.log("📸 Tomando foto... Mantenga su rostro centrado y estable");
        // Tomar foto con máxima calidad
        const photoData = this.captureHighQualityPhoto();
        if (photoData) {
          console.log("✅ Foto capturada para validación:", photoData);
          console.log("✅ Foto capturada - Ahora ingrese el ID para validar");
          // 🔧 CORREGIDO: Limpiar ID temporal y mostrar modal para ID real
          this.currentUserData = null;
          // 🔧 ELIMINADO: Sistema antiguo de modales - usar solo el nuevo sistema de fases
          // this.showValidationModal();
          // this.currentProcess = 'form';
          // this.updateButton();
        } else {
          console.log(
            "❌ Error: No se pudo capturar la foto. Intente nuevamente."
          );
        }
      } catch (error) {
        console.error("❌ Error tomando foto para validación:", error);
        console.log(
          "❌ Error:",
          error instanceof Error ? error.message : "Error desconocido"
        );
      }
    }
    // 🔧 NUEVO MÉTODO: Enviar foto al backend
    async sendPhotoToBackend(photoData) {
      try {
        console.log("🚀 Enviando foto al backend...");
        // Verificar que tenemos datos de usuario
        if (!this.currentUserData || !this.currentUserData.id) {
          throw new Error("No hay datos de usuario para enviar");
        }
        // Preparar payload para registro
        const payload = {
          person_id: this.currentUserData.id,
          person_name: this.currentUserData.name || "Usuario Test",
          images_base64: [photoData.data],
          person_email: this.currentUserData.email,
          metadata: {
            source: "sfi-facial-component",
            timestamp: new Date().toISOString(),
            photo_quality: photoData.quality,
            photo_dimensions: photoData.dimensions,
          },
        };
        console.log("📤 Payload preparado:", {
          person_id: payload.person_id,
          person_name: payload.person_name,
          image_size: Math.round(photoData.data.length / 1024) + "KB",
          image_dimensions: photoData.dimensions,
        });
        // Enviar a API de registro
        const response = await this.registerWithAPI([photoData.data]);
        if (response && response.success) {
          console.log("✅ Foto enviada exitosamente al backend:", response);
          this.updateInstructions(
            "✅ Registro Exitoso",
            "Foto enviada y procesada correctamente"
          );
          // Limpiar fotos y resetear estado
          this.clearCapturedPhotos();
          this.currentProcess = "idle";
          this.updateButton();
          // Emitir evento de éxito
          this.emitEvent("registration-success", response);
        } else {
          throw new Error("Respuesta del backend no exitosa");
        }
      } catch (error) {
        console.error("❌ Error enviando foto al backend:", error);
        this.updateInstructions(
          "❌ Error de Envío",
          error instanceof Error ? error.message : "Error enviando foto"
        );
        // 🔧 ELIMINADO: Sistema antiguo de modales - usar solo el nuevo sistema de fases
        // this.showRegistrationModal();
      }
    }
    // 🔧 NUEVO MÉTODO: Capturar foto de alta calidad
    // 🔧 REFACTORIZADO: Usar CameraManager
    captureHighQualityPhoto() {
      if (this.cameraManager) {
        const photoData = this.cameraManager.captureHighQualityPhoto();
        if (photoData) {
          // Agregar metadata adicional
          const enhancedPhotoData = {
            ...photoData,
            gestureType: "final",
            size: photoData.data.length,
            dimensions: `${photoData.width}x${photoData.height}`,
            quality: "high",
          };
          // Agregar a la lista
          this.capturedPhotos.push(enhancedPhotoData);
          console.log(
            `📸 Foto de alta calidad capturada: ${Math.round(photoData.data.length / 1024)}KB, ${photoData.width}x${photoData.height}`
          );
          // Emitir evento
          this.dispatchEvent(
            new CustomEvent("photo-captured", {
              detail: {
                gestureType: "final",
                photoData: enhancedPhotoData,
                totalPhotos: this.capturedPhotos.length,
              },
            })
          );
          return enhancedPhotoData;
        }
        return null;
      } else {
        // Fallback si CameraManager no está inicializado
        console.warn("⚠️ CameraManager no inicializado, usando método antiguo");
        return null;
      }
    }
    // Public method to cancel current process
    cancelProcess() {
      this.stopProcessing();
      this.currentProcess = "idle";
      this.updateButton();
      // Detener renderizado
      if (this.renderingInterval) {
        clearInterval(this.renderingInterval);
        this.renderingInterval = null;
      }
    }
    // Private method to emit events
    emitEvent(eventName, detail) {
      const event = new CustomEvent(eventName, {
        detail,
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
    }
    // Private method to emit errors
    emitError(code, message) {
      this.emitEvent("error", { code, message });
    }
    // 🔧 CORREGIDO: Capturar foto para un gesto específico con ALTA CALIDAD
    capturePhotoForGesture(gestureType) {
      if (!this.videoElement || !this.canvasElement) {
        console.error(
          "❌ No se puede capturar foto: elementos de video/canvas no disponibles"
        );
        return;
      }
      // Verificar que el video esté listo y reproduciéndose
      if (this.videoElement.readyState !== 4) {
        console.error(
          `❌ No se puede capturar foto para ${gestureType}: video no está listo (readyState: ${this.videoElement.readyState})`
        );
        return;
      }
      if (this.videoElement.paused || this.videoElement.ended) {
        console.error(
          `❌ No se puede capturar foto para ${gestureType}: video no está reproduciéndose`
        );
        return;
      }
      // Verificar que no se haya capturado ya una foto para este gesto
      const existingPhoto = this.capturedPhotos.find(
        (photo) => photo.gestureType === gestureType
      );
      if (existingPhoto) {
        console.log(
          `📸 Foto para ${gestureType} ya capturada anteriormente, saltando...`
        );
        return;
      }
      try {
        const canvas = this.canvasElement;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("❌ No se puede obtener contexto 2D del canvas");
          return;
        }
        // 🔧 CRÍTICO: Usar dimensiones REALES del video, no fijas
        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;
        if (
          !videoWidth ||
          !videoHeight ||
          videoWidth < 100 ||
          videoHeight < 100
        ) {
          console.error(
            `❌ No se puede capturar foto para ${gestureType}: dimensiones de video inválidas (${videoWidth}x${videoHeight})`
          );
          return;
        }
        // 🔧 CRÍTICO: Configurar canvas con dimensiones EXACTAS del video
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        // 🔧 CRÍTICO: Limpiar canvas antes de dibujar
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 🔧 CRÍTICO: Dibujar el frame actual del video con dimensiones exactas
        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
        // 🔧 CRÍTICO: Verificar que la imagen tenga contenido (no esté en blanco)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hasContent = this.checkImageHasContent(imageData);
        if (!hasContent) {
          console.error(
            `❌ No se puede capturar foto para ${gestureType}: imagen en blanco o sin contenido`
          );
          return;
        }
        // 🔧 CRÍTICO: Convertir a base64 con CALIDAD MÁXIMA
        const photoBase64 = canvas.toDataURL("image/jpeg", 1.0); // Calidad máxima
        // 🔧 CRÍTICO: Validar que la imagen tenga un tamaño mínimo razonable
        if (photoBase64.length < 15000) {
          // Aumentado a 15KB mínimo para asegurar calidad
          console.error(
            `❌ No se puede capturar foto para ${gestureType}: imagen demasiado pequeña (${photoBase64.length} caracteres, mínimo 15000)`
          );
          return;
        }
        // 🔧 CRÍTICO: Validar que la imagen tenga dimensiones mínimas REALES
        if (canvas.width < 200 || canvas.height < 200) {
          // Aumentado a 200x200 mínimo
          console.error(
            `❌ No se puede capturar foto para ${gestureType}: dimensiones insuficientes (${canvas.width}x${canvas.height}, mínimo 200x200)`
          );
          return;
        }
        // 🔧 CRÍTICO: Verificar que la imagen no sea corrupta
        if (this.isTestImage(photoBase64)) {
          console.error(
            `❌ No se puede capturar foto para ${gestureType}: imagen corrupta detectada`
          );
          return;
        }
        // Crear objeto de foto con metadata completa
        const photoData = {
          data: photoBase64,
          gestureType: gestureType,
          timestamp: Date.now(),
          size: photoBase64.length,
          dimensions: `${canvas.width}x${canvas.height}`,
          videoDimensions: `${videoWidth}x${videoHeight}`,
          quality: "high",
        };
        // Agregar a la lista de fotos capturadas
        this.capturedPhotos.push(photoData);
        console.log(
          `📸 Foto capturada para gesto: ${gestureType} (${this.capturedPhotos.length} fotos total, ${Math.round(photoBase64.length / 1024)}KB, ${canvas.width}x${canvas.height})`
        );
        // Emitir evento de foto capturada
        this.dispatchEvent(
          new CustomEvent("photo-captured", {
            detail: {
              gestureType,
              photoData,
              totalPhotos: this.capturedPhotos.length,
            },
          })
        );
      } catch (error) {
        console.error(`❌ Error capturando foto para ${gestureType}:`, error);
      }
    }
    /**
     * Verifica que la imagen tenga contenido (no esté en blanco)
     */
    checkImageHasContent(imageData) {
      const data = imageData.data;
      const length = data.length;
      // Verificar que no sea completamente transparente o en blanco
      let hasContent = false;
      let totalBrightness = 0;
      let sampleCount = 0;
      // Muestrear cada 4 píxeles para eficiencia
      for (let i = 0; i < length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        // Calcular brillo del píxel
        const brightness = (r + g + b) / 3;
        totalBrightness += brightness;
        sampleCount++;
        // Si hay algún píxel no transparente y con contenido, la imagen tiene contenido
        if (a > 10 && (brightness > 5 || brightness < 250)) {
          hasContent = true;
        }
      }
      // Calcular brillo promedio
      const avgBrightness = totalBrightness / sampleCount;
      // La imagen tiene contenido si:
      // 1. Hay píxeles no transparentes con variación de brillo
      // 2. El brillo promedio no es extremo (no es completamente blanca o negra)
      return hasContent && avgBrightness > 5 && avgBrightness < 250;
    }
    // 🔧 NUEVO: Obtener todas las fotos capturadas (solo datos base64)
    getCapturedPhotos() {
      return this.capturedPhotos.map((photo) => photo.data);
    }
    // 🔧 NUEVO: Obtener fotos con metadata completa
    getCapturedPhotosWithMetadata() {
      return [...this.capturedPhotos];
    }
    // 🔧 NUEVO: Limpiar fotos capturadas
    clearCapturedPhotos() {
      this.capturedPhotos = [];
      console.log("🗑️ Fotos capturadas limpiadas");
    }
    drawFacialMesh(landmarks) {
      if (
        !this.canvasElement ||
        !this.canvasContext ||
        !landmarks ||
        landmarks.length === 0
      ) {
        return;
      }
      try {
        const ctx = this.canvasContext;
        const canvas = this.canvasElement;
        // Limpiar canvas completamente
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // ===== EFECTOS SCI-FI: BOUNDING BOX Y ESQUINAS =====
        this.drawFaceBoundingBox(landmarks, ctx, canvas);
        // ===== DIBUJAR TODOS LOS LANDMARKS CON EFECTO GLOW VERDE MATRIX TENUE =====
        landmarks.forEach((landmark, index) => {
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          // Verificar coordenadas válidas
          if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
            return;
          }
          // Tonos de verde Matrix para diferentes regiones faciales
          let color = "rgba(0, 255, 0, 0.4)"; // Verde tenue por defecto
          let radius = 1.5;
          if (index <= 16) {
            color = "rgba(0, 255, 0, 0.6)"; // Verde más visible para contorno
            radius = 2;
          } else if (
            (index >= 33 && index <= 68) ||
            (index >= 362 && index <= 397)
          ) {
            color = "rgba(0, 200, 0, 0.5)"; // Verde medio para ojos
            radius = 1.8;
          } else if (
            (index >= 61 && index <= 96) ||
            (index >= 267 && index <= 302)
          ) {
            color = "rgba(0, 255, 0, 0.5)"; // Verde para boca
            radius = 1.8;
          } else if (
            (index >= 1 && index <= 9) ||
            (index >= 168 && index <= 175)
          ) {
            color = "rgba(100, 255, 100, 0.5)"; // Verde claro para nariz
            radius = 1.5;
          }
          // Efecto glow tenue en landmarks
          ctx.shadowBlur = 4; // Reducido de 8 a 4
          ctx.shadowColor = color;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI);
          ctx.fill();
          ctx.shadowBlur = 0;
        });
        // ===== DIBUJAR CONEXIONES FACIALES CON EFECTO =====
        this.drawFacialConnections(landmarks);
        // ===== EFECTO SCI-FI: LÍNEA DE BARRIDO =====
        this.drawScanLine(ctx, canvas);
        // ===== EFECTO SCI-FI: HUD CON ANÁLISIS =====
        this.drawAnalysisHUD(ctx, canvas, landmarks.length);
      } catch (error) {
        console.error("❌ Error dibujando malla facial:", error);
        this.drawFacialMeshFallback(landmarks);
      }
    }
    /**
     * Dibuja un bounding box con esquinas animadas alrededor de la cara
     */
    drawFaceBoundingBox(landmarks, ctx, canvas) {
      // Calcular bounding box de la cara
      let minX = Infinity,
        minY = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity;
      landmarks.forEach((landmark) => {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
      // Agregar padding
      const padding = 30;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;
      // Dibujar esquinas animadas (pulsantes) en verde Matrix tenue
      const cornerSize = 20;
      const pulseEffect = Math.sin(Date.now() / 200) * 1 + 1.5; // Reducido el pulso
      ctx.strokeStyle = "rgba(0, 255, 0, 0.5)"; // Verde Matrix tenue
      ctx.lineWidth = 1.5 + pulseEffect;
      ctx.shadowBlur = 5; // Reducido de 10 a 5
      ctx.shadowColor = "rgba(0, 255, 0, 0.3)";
      // Esquina superior izquierda
      ctx.beginPath();
      ctx.moveTo(minX + cornerSize, minY);
      ctx.lineTo(minX, minY);
      ctx.lineTo(minX, minY + cornerSize);
      ctx.stroke();
      // Esquina superior derecha
      ctx.beginPath();
      ctx.moveTo(maxX - cornerSize, minY);
      ctx.lineTo(maxX, minY);
      ctx.lineTo(maxX, minY + cornerSize);
      ctx.stroke();
      // Esquina inferior izquierda
      ctx.beginPath();
      ctx.moveTo(minX, maxY - cornerSize);
      ctx.lineTo(minX, maxY);
      ctx.lineTo(minX + cornerSize, maxY);
      ctx.stroke();
      // Esquina inferior derecha
      ctx.beginPath();
      ctx.moveTo(maxX - cornerSize, maxY);
      ctx.lineTo(maxX, maxY);
      ctx.lineTo(maxX, maxY - cornerSize);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Líneas punteadas en los lados en verde Matrix muy tenue
      ctx.strokeStyle = "rgba(0, 255, 0, 0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(minX, minY, boxWidth, boxHeight);
      ctx.setLineDash([]);
    }
    /**
     * Dibuja una línea de barrido vertical animada
     */
    drawScanLine(ctx, canvas) {
      // Animar posición de la línea - mucho más rápido
      this.scanLinePosition += 15 * this.scanLineDirection;
      if (this.scanLinePosition > canvas.height) {
        this.scanLineDirection = -1;
      } else if (this.scanLinePosition < 0) {
        this.scanLineDirection = 1;
      }
      // Dibujar línea de barrido con gradiente verde Matrix tenue
      const gradient = ctx.createLinearGradient(
        0,
        this.scanLinePosition - 20,
        0,
        this.scanLinePosition + 20
      );
      gradient.addColorStop(0, "rgba(0, 255, 0, 0)");
      gradient.addColorStop(0.5, "rgba(0, 255, 0, 0.3)"); // Reducido de 0.8 a 0.3
      gradient.addColorStop(1, "rgba(0, 255, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, this.scanLinePosition - 2, canvas.width, 4);
      // Efecto glow tenue en verde Matrix
      ctx.shadowBlur = 8; // Reducido de 15 a 8
      ctx.shadowColor = "rgba(0, 255, 0, 0.4)";
      ctx.fillRect(0, this.scanLinePosition - 1, canvas.width, 2);
      ctx.shadowBlur = 0;
    }
    /**
     * Dibuja HUD con información de análisis
     */
    drawAnalysisHUD(ctx, canvas, landmarkCount) {
      // Incrementar progreso de análisis
      if (this.analysisProgress < 100) {
        this.analysisProgress += 0.5;
      } else {
        this.analysisProgress = 100;
      }
      // Panel superior izquierdo más sutil
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // Más transparente
      ctx.fillRect(10, 10, 220, 100);
      // Borde del panel con glow verde Matrix tenue
      ctx.strokeStyle = "rgba(0, 255, 0, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 6; // Reducido de 10 a 6
      ctx.shadowColor = "rgba(0, 255, 0, 0.3)";
      ctx.strokeRect(10, 10, 220, 100);
      ctx.shadowBlur = 0;
      // Texto del HUD en verde Matrix
      ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
      ctx.font = "bold 14px monospace";
      ctx.fillText("ANÁLISIS FACIAL", 20, 30);
      ctx.font = "12px monospace";
      ctx.fillStyle = "rgba(0, 255, 0, 0.7)";
      ctx.fillText(`► PUNTOS: ${landmarkCount}`, 20, 50);
      ctx.fillText(`► PROGRESO: ${Math.floor(this.analysisProgress)}%`, 20, 68);
      // Barra de progreso
      const barWidth = 200;
      const barHeight = 8;
      const barX = 20;
      const barY = 80;
      // Fondo de la barra verde oscuro
      ctx.fillStyle = "rgba(0, 100, 0, 0.3)";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      // Progreso de la barra en verde Matrix
      ctx.fillStyle = "rgba(0, 255, 0, 0.6)";
      ctx.fillRect(
        barX,
        barY,
        (barWidth * this.analysisProgress) / 100,
        barHeight
      );
      // Borde de la barra
      ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
    // Dibujar conexiones entre landmarks para formar malla facial
    drawFacialConnections(landmarks) {
      if (
        !this.canvasContext ||
        !this.canvasElement ||
        !landmarks ||
        landmarks.length < 468
      ) {
        return; // Necesitamos los 468 landmarks de MediaPipe para las conexiones
      }
      const ctx = this.canvasContext;
      const canvas = this.canvasElement;
      // Configurar estilo para las líneas
      ctx.strokeStyle = "rgba(0, 255, 0, 0.6)";
      ctx.lineWidth = 1;
      // Función helper para dibujar línea entre dos landmarks
      const drawConnection = (i1, i2) => {
        if (landmarks[i1] && landmarks[i2]) {
          const x1 = landmarks[i1].x * canvas.width;
          const y1 = landmarks[i1].y * canvas.height;
          const x2 = landmarks[i2].x * canvas.width;
          const y2 = landmarks[i2].y * canvas.height;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      };
      // CONTORNO FACIAL - MediaPipe indices reales
      const faceOval = [
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
        379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234,
        127, 162, 21, 54, 103, 67, 109, 10,
      ];
      for (let i = 0; i < faceOval.length - 1; i++) {
        drawConnection(faceOval[i], faceOval[i + 1]);
      }
      // OJO IZQUIERDO
      const leftEye = [
        33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161,
        246, 33,
      ];
      for (let i = 0; i < leftEye.length - 1; i++) {
        drawConnection(leftEye[i], leftEye[i + 1]);
      }
      // OJO DERECHO
      const rightEye = [
        362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385,
        384, 398, 362,
      ];
      for (let i = 0; i < rightEye.length - 1; i++) {
        drawConnection(rightEye[i], rightEye[i + 1]);
      }
      // BOCA EXTERNA
      const outerMouth = [
        61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 402, 317, 14,
        87, 178, 88, 95, 61,
      ];
      for (let i = 0; i < outerMouth.length - 1; i++) {
        drawConnection(outerMouth[i], outerMouth[i + 1]);
      }
      // BOCA INTERNA
      const innerMouth = [
        78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 78,
      ];
      for (let i = 0; i < innerMouth.length - 1; i++) {
        drawConnection(innerMouth[i], innerMouth[i + 1]);
      }
      // NARIZ
      const nose = [
        168, 8, 9, 10, 151, 195, 197, 196, 3, 51, 48, 115, 131, 134, 102, 48,
        64, 168,
      ];
      for (let i = 0; i < nose.length - 1; i++) {
        drawConnection(nose[i], nose[i + 1]);
      }
      // CEJAS
      const leftEyebrow = [46, 53, 52, 51, 48, 115, 131, 134, 102, 48, 64];
      for (let i = 0; i < leftEyebrow.length - 1; i++) {
        drawConnection(leftEyebrow[i], leftEyebrow[i + 1]);
      }
      const rightEyebrow = [
        276, 283, 282, 281, 278, 344, 360, 363, 331, 278, 294,
      ];
      for (let i = 0; i < rightEyebrow.length - 1; i++) {
        drawConnection(rightEyebrow[i], rightEyebrow[i + 1]);
      }
    }
    // Fallback para dibujar malla facial sin DrawingUtils
    drawFacialMeshFallback(landmarks) {
      if (!this.canvasContext || !this.canvasElement || !landmarks) return;
      const ctx = this.canvasContext;
      const canvas = this.canvasElement;
      // Limpiar canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Configurar estilos
      ctx.fillStyle = "#00FF00";
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 1;
      // Dibujar landmarks como puntos
      landmarks.forEach((landmark, index) => {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;
        if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
      // Información en pantalla
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px Arial";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      const info = [
        "⚠️ Modo FALLBACK",
        `${landmarks.length} landmarks detectados`,
        "MediaPipe service falló",
      ];
      info.forEach((text, index) => {
        const y = 25 + index * 25;
        ctx.strokeText(text, 15, y);
        ctx.fillText(text, 15, y);
      });
      console.log(`⚠️ Usando fallback para ${landmarks.length} landmarks`);
    }
    // ============================================================================
    // 🖊️ MÉTODOS PARA MODO FIRMA (SIGN)
    // ============================================================================
    /**
     * Inicia el proceso de firma digital
     */
    async handleSignStart() {
      console.log("🖊️ Iniciando proceso de firma digital");
      // Verificar que tenemos los datos necesarios
      if (!this.personId) {
        this.showError("Error: person-id es requerido para el modo firma");
        return;
      }
      if (!this.documentHash) {
        this.showError("Error: document-hash es requerido para el modo firma");
        return;
      }
      // Crear request de firma
      this.signatureRequest = {
        person_id: this.personId,
        document_hash: this.documentHash,
        safemetrics_form_id: this.safemetricsFormId || undefined,
      };
      // Emitir evento de inicio
      const event = new CustomEvent("sign-start", {
        detail: { person_id: this.personId },
      });
      this.dispatchEvent(event);
      // Cambiar a fase de alerta de liveness
      this.changePhase("liveness_alert");
    }
    /**
     * Procesa la validación biométrica antes de firmar
     */
    async handleSignValidation(faceData) {
      console.log("🖊️ Procesando validación biométrica para firma");
      try {
        // Cambiar a fase de procesamiento
        this.changePhase("processing");
        // Validar identidad usando el servicio de firma
        const validationResult = await this.signatureService.validateForSigning(
          this.personId,
          faceData.image.split(",")[1] // Remover prefijo data:image
        );
        // Emitir evento de validación completa
        const validationEvent = new CustomEvent("sign-validation-complete", {
          detail: validationResult,
        });
        this.dispatchEvent(validationEvent);
        if (!validationResult.ready_to_sign) {
          this.showError(`Validación fallida: ${validationResult.message}`);
          return;
        }
        // Si la validación es exitosa, proceder con la firma
        await this.processDocumentSignature(faceData);
      } catch (error) {
        console.error("❌ Error en validación para firma:", error);
        this.showError(
          `Error de validación: ${error instanceof Error ? error.message : "Error desconocido"}`
        );
      }
    }
    /**
     * Procesa la firma del documento
     */
    async processDocumentSignature(faceData) {
      console.log("🖊️ Procesando firma del documento");
      try {
        // Emitir evento de procesamiento
        const processingEvent = new CustomEvent("sign-processing", {
          detail: { status: "signing_document" },
        });
        this.dispatchEvent(processingEvent);
        // Realizar la firma
        const signResult = await this.signatureService.signDocument(
          this.signatureRequest,
          faceData.image.split(",")[1], // Remover prefijo data:image
          {
            liveness_score: faceData.livenessScore,
            captured_photos_count: this.capturedPhotos.length,
            component_version: "1.0.0",
          }
        );
        this.currentSignResult = signResult;
        if (signResult.success) {
          // Emitir evento de éxito
          const successEvent = new CustomEvent("sign-success", {
            detail: signResult,
          });
          this.dispatchEvent(successEvent);
          // Mostrar resultado exitoso
          this.showSignSuccessResult(signResult);
        } else {
          this.showError(`Error en firma: ${signResult.message}`);
        }
      } catch (error) {
        console.error("❌ Error procesando firma:", error);
        this.showError(
          `Error de firma: ${error instanceof Error ? error.message : "Error desconocido"}`
        );
        // Emitir evento de error
        const errorEvent = new CustomEvent("sign-error", {
          detail: {
            code: "SIGN_PROCESSING_ERROR",
            message:
              error instanceof Error ? error.message : "Error desconocido",
          },
        });
        this.dispatchEvent(errorEvent);
      }
    }
    /**
     * Muestra un mensaje de error en la interfaz
     */
    showError(message) {
      console.error("❌ Error:", message);
      // Cambiar a fase de error
      this.changePhase("error");
      // Actualizar mensaje de error
      if (this.phaseElements.errorMessage) {
        this.phaseElements.errorMessage.textContent = message;
      }
      // Emitir evento de error
      const errorEvent = new CustomEvent("error", {
        detail: { message },
      });
      this.dispatchEvent(errorEvent);
    }
    /**
     * Muestra el resultado exitoso de la firma
     */
    showSignSuccessResult(signResult) {
      console.log("✅ Mostrando resultado exitoso de firma");
      this.changePhase("complete");
      // Actualizar mensaje de completado
      if (this.phaseElements.completeMessage) {
        this.phaseElements.completeMessage.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 3em; margin-bottom: 15px;">✅</div>
          <h3 style="color: #059669; margin-bottom: 15px;">Firma Digital Completada</h3>
          <div style="background: #f0f9ff; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
            <p><strong>🆔 ID:</strong> ${signResult.person_id}</p>
            <p><strong>👤 Nombre:</strong> ${signResult.person_name}</p>
            <p><strong>🔑 Firma ID:</strong> ${signResult.signature_id}</p>
            <p><strong>🎯 Confianza:</strong> ${(signResult.confidence_score * 100).toFixed(1)}%</p>
          </div>
          ${
            signResult.qr_png
              ? `
            <div style="margin: 20px 0;">
              <p><strong>📱 Código QR de Validación:</strong></p>
              <img src="${signResult.qr_png}" alt="QR de validación" style="max-width: 200px; border-radius: 8px; border: 2px solid #d1d5db;" />
              <p style="font-size: 0.9em; color: #6b7280; margin-top: 10px;">
                Escanea este código para validar la firma
              </p>
            </div>
          `
              : ""
          }
        </div>
      `;
      }
      // Configurar API base URL en el servicio si está definida
      if (this.apiBaseUrl) {
        this.signatureService.setApiBaseUrl(this.apiBaseUrl);
      }
    }
    /**
     * Muestra el resultado exitoso de validación
     */
    showValidationSuccessResult(validationResult) {
      console.log("✅ Mostrando resultado exitoso de validación");
      this.changePhase("complete");
      // Actualizar mensaje de completado
      if (this.phaseElements.completeMessage) {
        this.phaseElements.completeMessage.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 3em; margin-bottom: 15px;">✅</div>
          <h3 style="color: #059669; margin-bottom: 15px;">Autenticación Exitosa</h3>
          <div style="background: #f0f9ff; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
            <p><strong>🆔 ID:</strong> ${validationResult.person_id || "N/A"}</p>
            <p><strong>👤 Nombre:</strong> ${validationResult.person_name || "N/A"}</p>
            <p><strong>🎯 Confianza:</strong> ${(validationResult.confidence * 100).toFixed(1)}%</p>
            <p><strong>✅ Estado:</strong> Identidad verificada correctamente</p>
          </div>
        </div>
      `;
      }
    }
    /**
     * Muestra el resultado exitoso de registro
     */
    showRegisterSuccessResult(registrationResult) {
      console.log("✅ Mostrando resultado exitoso de registro");
      console.log("📊 Datos recibidos del registro:", registrationResult);
      this.changePhase("complete");
      // Extraer datos de la respuesta
      // La respuesta puede ser un array o un objeto
      const isArray = Array.isArray(registrationResult);
      const imageData = isArray ? registrationResult[0] : registrationResult;
      // Determinar calidad de la imagen
      let qualityInfo = "";
      if (imageData?.quality_score !== undefined) {
        const qualityPercent = (imageData.quality_score * 100).toFixed(1);
        qualityInfo = `<p><strong>📊 Calidad de Imagen:</strong> ${qualityPercent}%</p>`;
      }
      // Actualizar mensaje de completado
      if (this.phaseElements.completeMessage) {
        this.phaseElements.completeMessage.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 3em; margin-bottom: 15px;">✅</div>
          <h3 style="color: #059669; margin-bottom: 15px;">Registro Completado Exitosamente</h3>
          <div style="background: #f0f9ff; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
            <p><strong>🆔 ID:</strong> ${this.currentUserData?.id || "N/A"}</p>
            <p><strong>👤 Nombre:</strong> ${this.currentUserData?.name || "N/A"}</p>
            ${qualityInfo}
            <p><strong>✅ Estado:</strong> Usuario registrado correctamente</p>
          </div>
        </div>
      `;
      }
    }
    /**
     * Modifica el flujo de liveness para el modo firma
     */
    handleSignLivenessComplete(livenessResult, faceData) {
      console.log("🖊️ Liveness completado para firma:", livenessResult);
      // Emitir evento específico de liveness para firma
      const livenessEvent = new CustomEvent("sign-liveness-complete", {
        detail: faceData,
      });
      this.dispatchEvent(livenessEvent);
      // Proceder con validación biométrica
      this.handleSignValidation(faceData);
    }
    /**
     * Getter/Setter para timeout de la API
     */
    get apiTimeout() {
      return this._apiTimeout;
    }
    set apiTimeout(timeout) {
      this._apiTimeout = timeout;
      console.log(`🔧 Actualizando apiTimeout a: ${timeout}ms`);
      // 🔧 REFACTORIZADO: Actualizar APIHandler si está inicializado
      if (this.apiHandler) {
        this.apiHandler.updateConfig({ apiTimeout: timeout });
      }
      // Actualizar el SignatureService con el nuevo timeout
      this.signatureService = new SignatureService({
        apiBaseUrl: this.apiUrl,
        timeout: timeout,
        eventDispatcher: (eventName, detail) => {
          const event = new CustomEvent(eventName, { detail });
          this.dispatchEvent(event);
        },
      });
      console.log(`✅ SignatureService actualizado con timeout: ${timeout}ms`);
    }
    /**
     * Método público para obtener el resultado actual de la firma
     */
    getSignResult() {
      return this.currentSignResult;
    }
    // 🎨 Getters para props de estilo del botón
    get buttonBgColor() {
      return this.getAttribute("button-bg-color");
    }
    get buttonTextColor() {
      return this.getAttribute("button-text-color");
    }
    get buttonBorderColor() {
      return this.getAttribute("button-border-color");
    }
    get buttonBorderRadius() {
      return this.getAttribute("button-border-radius");
    }
    get buttonFontSize() {
      return this.getAttribute("button-font-size");
    }
    get buttonFontWeight() {
      return this.getAttribute("button-font-weight");
    }
    get buttonPadding() {
      return this.getAttribute("button-padding");
    }
    get buttonBoxShadow() {
      return this.getAttribute("button-box-shadow");
    }
    get buttonHoverTransform() {
      return this.getAttribute("button-hover-transform");
    }
    get buttonHoverBoxShadow() {
      return this.getAttribute("button-hover-box-shadow");
    }
  }
  // 🔧 CORREGIDO: Propiedad estática para mantener datos de usuario entre instancias
  SfiFacial._globalUserData = null;
  SfiFacial._globalInstanceId = null;
  // Register the custom element
  if (!customElements.get("sfi-facial")) {
    customElements.define("sfi-facial", SfiFacial);
  }

  exports.CameraService = CameraService;
  exports.FacialComparisonService = FacialComparisonService;
  exports.LivenessDetector = LivenessDetector;
  exports.QRService = QRService;
  exports.SfiFacial = SfiFacial;
  exports.SignatureService = SignatureService;
  exports.StorageService = StorageService;
});
//# sourceMappingURL=index.js.map
