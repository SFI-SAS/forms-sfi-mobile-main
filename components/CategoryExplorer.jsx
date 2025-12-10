import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Dimensions,
  TextInput,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import NetInfo from "@react-native-community/netinfo";

const { width, height } = Dimensions.get("window");

// Keys para AsyncStorage
const CATEGORIES_CACHE_KEY = "categories_explorer_cache";
const FORMS_BY_CATEGORY_CACHE_KEY = "forms_by_category_cache";
const CATEGORIES_TIMESTAMP_KEY = "categories_timestamp_cache";
const FORMS_TIMESTAMP_KEY = "forms_timestamp_cache";
const BACKEND_URL_KEY = "backend_url";
const APP_FIRST_LOAD_DONE_KEY = "app_first_load_done"; // ✅ NUEVO: Sincronizar con Home
const CACHE_EXPIRATION_TIME = 10 * 60 * 1000; // 10 minutos

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

// ✅ OPTIMIZADO: Componente memoizado para items de formulario
const FormItem = React.memo(({ form, onPress }) => (
  <TouchableOpacity
    style={styles.formCard}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={styles.formIconContainer}>
      <Text style={styles.formIcon}>📋</Text>
    </View>
    <View style={styles.formInfo}>
      <Text style={styles.formTitle} numberOfLines={1}>
        {form.title}
      </Text>
      <Text style={styles.formDescription} numberOfLines={2}>
        {form.description || "Sin descripción"}
      </Text>
      {form.category && (
        <View style={styles.formCategoryBadge}>
          <Text style={styles.formCategoryText}>📁 {form.category.name}</Text>
        </View>
      )}
    </View>
  </TouchableOpacity>
));

export default function CategoryExplorer({ onSelectForm, refreshTrigger }) {
  const [categories, setCategories] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [currentForms, setCurrentForms] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [categoriesCache, setCategoriesCache] = useState({});
  const [formsCache, setFormsCache] = useState({});
  const [categoriesTimestamp, setCategoriesTimestamp] = useState({});
  const [formsTimestamp, setFormsTimestamp] = useState({});
  const [isOnline, setIsOnline] = useState(true);

  // ✅ NUEVO: Estados para control de carga y prevención de bucles
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [lastLoadedCategory, setLastLoadedCategory] = useState(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // ✅ DETECTAR CONECTIVIDAD
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected;
      setIsOnline(connected);
      console.log(connected ? "🌐 ONLINE" : "📴 OFFLINE");
    });
    return () => unsubscribe();
  }, []);

  // ✅ NUEVO: Referencias para mantener estado de scroll y navegación
  const scrollViewRef = useRef(null);
  const flatListRef = useRef(null);
  const scrollPosition = useRef(0);
  const saveTimeoutRef = useRef(null); // ✅ AGREGADO: Ref para debounce de guardado de cache
  const lastNavigationState = useRef({
    path: [],
    searchTerm: "",
    scrollY: 0,
  });
  const hasRestoredState = useRef(false); // ✅ NUEVO: Evitar múltiples restauraciones

  // ✅ DETECTAR CONECTIVIDAD
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected;
      setIsOnline(connected);
      if (connected) {
        console.log("🌐 [CategoryExplorer] ONLINE - Consultando endpoints");
      } else {
        console.log("📴 [CategoryExplorer] OFFLINE - Usando AsyncStorage");
      }
    });
    return () => unsubscribe();
  }, []);

  // Cargar cache al inicio - SOLO cuando esté OFFLINE
  useEffect(() => {
    if (!cacheLoaded && !isOnline) {
      loadCacheFromStorage()
        .then(() => {
          setCacheLoaded(true);
        })
        .catch((err) => {
          console.error("❌ Error crítico cargando cache:", err);
          setCacheLoaded(true); // Continuar incluso si falla
        });
    }
  }, []);

  // Cargar categorías raíz al inicio - SOLO LA PRIMERA VEZ O CON REFRESH
  useEffect(() => {
    if (cacheLoaded && !isInitialized && lastLoadedCategory === null) {
      setIsInitialized(true);
      setLastLoadedCategory("initial");

      const initializeExplorer = async () => {
        // ✅ VERIFICAR FLAG DE PRIMERA CARGA (compartida con Home)
        const firstLoadDone = await AsyncStorage.getItem(
          APP_FIRST_LOAD_DONE_KEY
        );
        const shouldFetchFromBackend =
          !firstLoadDone || firstLoadDone !== "true";

        // ✅ RESTAURAR estado previo si existe (SOLO SI NO SE HA RESTAURADO ANTES)
        if (
          lastNavigationState.current.path.length > 0 &&
          !hasRestoredState.current
        ) {
          hasRestoredState.current = true;

          const savedPath = lastNavigationState.current.path;
          const savedSearch = lastNavigationState.current.searchTerm;
          const savedScrollY = lastNavigationState.current.scrollY;

          console.log("🔄 Restaurando estado previo de navegación");
          setCurrentPath(savedPath);
          setSearchTerm(savedSearch);

          const categoryId =
            savedPath.length > 0 ? savedPath[savedPath.length - 1].id : null;

          // ✅ CARGAR DESDE CACHE (forceRefresh = false)
          Promise.all([
            loadCategories(categoryId, false).catch((err) => {
              console.error("❌ Error restaurando categorías:", err);
            }),
            loadForms(categoryId, false).catch((err) => {
              console.error("❌ Error restaurando forms:", err);
            }),
          ]).then(() => {
            // Restaurar scroll después de cargar datos
            setTimeout(() => {
              if (scrollViewRef.current && savedScrollY > 0) {
                scrollViewRef.current.scrollTo({
                  y: savedScrollY,
                  animated: false,
                });
              }
            }, 100);
          });
        } else if (!hasRestoredState.current) {
          hasRestoredState.current = true;

          // ✅ SIEMPRE CARGAR DESDE CACHE - Home ya precargó todo
          console.log("📦 Cargando CategoryExplorer desde cache precargado");
          Promise.all([
            loadCategories(null, false).catch((err) => {
              console.error("❌ Error cargando categorías desde cache:", err);
            }),
            loadForms(null, false).catch((err) => {
              console.error("❌ Error cargando forms desde cache:", err);
            }),
          ]).catch((err) => {
            console.error("❌ Error crítico cargando cache:", err);
          });
        }
      };

      initializeExplorer();
    }
  }, [cacheLoaded, isInitialized]);

  // Refrescar cuando se detecta trigger - CON CONTROL
  useEffect(() => {
    if (
      refreshTrigger &&
      refreshTrigger > 0 &&
      !isLoadingCategories &&
      !isLoadingForms
    ) {
      const currentCategoryId =
        currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;

      console.log("🔄 Refresh trigger detectado, forzando actualización");
      loadCategories(currentCategoryId, true);
      loadForms(currentCategoryId, true);
    }
  }, [refreshTrigger]);

  // ✅ CLEANUP: Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // ✅ NUEVO: Guardar estado de navegación cuando cambia
  useEffect(() => {
    lastNavigationState.current = {
      path: currentPath,
      searchTerm: searchTerm,
      scrollY: scrollPosition.current,
    };
  }, [currentPath, searchTerm]);

  // ✅ NUEVO: Capturar posición de scroll
  const handleScroll = useCallback((event) => {
    scrollPosition.current = event.nativeEvent.contentOffset.y;
  }, []);

  // Cargar cache desde AsyncStorage - CON PROTECCIÓN
  const loadCacheFromStorage = async () => {
    try {
      const [
        categoriesCacheRaw,
        formsCacheRaw,
        categoriesTimestampRaw,
        formsTimestampRaw,
      ] = await Promise.all([
        AsyncStorage.getItem(CATEGORIES_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(FORMS_BY_CATEGORY_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(CATEGORIES_TIMESTAMP_KEY).catch(() => null),
        AsyncStorage.getItem(FORMS_TIMESTAMP_KEY).catch(() => null),
      ]);

      if (categoriesCacheRaw) {
        try {
          setCategoriesCache(JSON.parse(categoriesCacheRaw));
        } catch (e) {
          console.warn("⚠️ Cache de categorías corrupto, ignorando");
        }
      }
      if (formsCacheRaw) {
        try {
          setFormsCache(JSON.parse(formsCacheRaw));
        } catch (e) {
          console.warn("⚠️ Cache de forms corrupto, ignorando");
        }
      }
      if (categoriesTimestampRaw) {
        try {
          setCategoriesTimestamp(JSON.parse(categoriesTimestampRaw));
        } catch (e) {
          console.warn("⚠️ Timestamp de categorías corrupto, ignorando");
        }
      }
      if (formsTimestampRaw) {
        try {
          setFormsTimestamp(JSON.parse(formsTimestampRaw));
        } catch (e) {
          console.warn("⚠️ Timestamp de forms corrupto, ignorando");
        }
      }

      // ✅ LOG REDUCIDO
      // console.log("✅ Cache cargado desde AsyncStorage");
    } catch (error) {
      console.error("❌ Error cargando cache:", error);
      // No lanzar el error, dejar que la app continúe sin cache
    }
  };

  // Guardar cache en AsyncStorage - OPTIMIZADO con debounce
  const saveCacheToStorage = (
    newCategoriesCache,
    newFormsCache,
    newCategoriesTimestamp,
    newFormsTimestamp
  ) => {
    // Validar que los datos sean serializables
    if (
      !newCategoriesCache ||
      !newFormsCache ||
      !newCategoriesTimestamp ||
      !newFormsTimestamp
    ) {
      return;
    }

    // ✅ DEBOUNCE: Cancelar guardado pendiente
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // ✅ GUARDAR DESPUÉS DE 500ms de inactividad (no bloquea UI)
    saveTimeoutRef.current = setTimeout(() => {
      Promise.all([
        AsyncStorage.setItem(
          CATEGORIES_CACHE_KEY,
          JSON.stringify(newCategoriesCache)
        ).catch((err) =>
          console.error("❌ Error guardando categories cache:", err.message)
        ),
        AsyncStorage.setItem(
          FORMS_BY_CATEGORY_CACHE_KEY,
          JSON.stringify(newFormsCache)
        ).catch((err) =>
          console.error("❌ Error guardando forms cache:", err.message)
        ),
        AsyncStorage.setItem(
          CATEGORIES_TIMESTAMP_KEY,
          JSON.stringify(newCategoriesTimestamp)
        ).catch((err) =>
          console.error("❌ Error guardando categories timestamp:", err.message)
        ),
        AsyncStorage.setItem(
          FORMS_TIMESTAMP_KEY,
          JSON.stringify(newFormsTimestamp)
        ).catch((err) =>
          console.error("❌ Error guardando forms timestamp:", err.message)
        ),
      ]).catch((error) => {
        console.error("❌ Error guardando cache:", error.message);
      });
    }, 500);
  };

  // Verificar si el cache es válido (no expirado)
  const isCacheValid = (timestamp) => {
    if (!timestamp) return false;
    const now = Date.now();
    return now - timestamp < CACHE_EXPIRATION_TIME;
  };

  // ✅ OPTIMIZADO: Cargar categorías - Primero cache, luego backend si es necesario
  const loadCategories = async (parentId, forceRefresh = false) => {
    // ✅ GUARD: Prevenir ejecuciones paralelas
    if (isLoadingCategories) {
      return;
    }

    const cacheKey = parentId === null ? "root" : parentId.toString();

    // ✅ SI ESTÁ OFFLINE: Usar caché
    if (!isOnline && categoriesCache[cacheKey]) {
      console.log(`📴 [OFFLINE] Usando caché de categorías (${cacheKey})`);
      setCategories(categoriesCache[cacheKey]);
      return;
    }

    // ✅ SI ESTÁ ONLINE: Siempre consultar endpoint
    if (isOnline) {
      console.log(
        `🌐 [ONLINE] Consultando categorías desde endpoint: ${cacheKey}`
      );
    }

    // ✅ ACTIVAR LOCK
    setIsLoadingCategories(true);
    setLastLoadedCategory(cacheKey);

    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        if (categoriesCache[cacheKey]) {
          setCategories(categoriesCache[cacheKey]);
        }
        return;
      }

      const backendUrl = await getBackendUrl();
      const url = parentId
        ? `${backendUrl}/forms/categories/by-parent?parent_id=${parentId}`
        : `${backendUrl}/forms/categories/by-parent`;

      const logPrefix = forceRefresh ? "🌐 [REFRESH FORZADO]" : "🌐";
      console.log(`${logPrefix} Consultando categorías: ${cacheKey}`);
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();

      // ✅ VALIDAR respuesta
      if (!Array.isArray(data)) {
        console.warn("⚠️ Respuesta de categorías no es array");
        setCategories([]);
        return;
      }

      const now = Date.now();
      console.log(
        `✅ ${data.length} categorías cargadas desde endpoint (${cacheKey})`
      );

      setCategories(data);

      // ✅ ACTUALIZAR CACHE para uso offline futuro
      try {
        const newCache = { ...categoriesCache, [cacheKey]: data };
        const newTimestamp = { ...categoriesTimestamp, [cacheKey]: now };
        setCategoriesCache(newCache);
        setCategoriesTimestamp(newTimestamp);

        // ✅ Guardar en AsyncStorage como respaldo para modo offline
        saveCacheToStorage(newCache, formsCache, newTimestamp, formsTimestamp);
        console.log(
          `💾 Respaldo guardado en AsyncStorage para uso offline (${cacheKey})`
        );
      } catch (cacheErr) {
        console.warn("⚠️ Error guardando respaldo:", cacheErr.message);
      }
    } catch (error) {
      console.error("❌ Error cargando categorías:", error);

      // Fallback a cache si existe
      if (categoriesCache[cacheKey]) {
        setCategories(categoriesCache[cacheKey]);
      }
    } finally {
      // ✅ LIBERAR LOCK
      setIsLoadingCategories(false);
    }
  };

  // ✅ OPTIMIZADO: Cargar formularios - Primero cache, luego backend si es necesario
  const loadForms = async (
    categoryId,
    forceRefresh = false,
    includeSubcategories = false
  ) => {
    // ✅ GUARD: Prevenir ejecuciones paralelas
    if (isLoadingForms) {
      return;
    }

    const cacheKey =
      categoryId === null ? "root" : `${categoryId}_${includeSubcategories}`;

    // ✅ SI ESTÁ OFFLINE: Usar caché
    if (!isOnline && formsCache[cacheKey]) {
      console.log(`📴 [OFFLINE] Usando cache de formularios (${cacheKey})`);
      setCurrentForms(formsCache[cacheKey]);
      return;
    }

    // ✅ SI ESTÁ ONLINE: Siempre consultar endpoint
    console.log(
      `🌐 [ONLINE] Consultando formularios desde endpoint: ${cacheKey}`
    );

    // ✅ ACTIVAR LOCK
    setIsLoadingForms(true);

    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        if (formsCache[cacheKey]) {
          setCurrentForms(formsCache[cacheKey]);
        }
        return;
      }

      const backendUrl = await getBackendUrl();
      const url = categoryId
        ? `${backendUrl}/forms/categories/${categoryId}/forms?include_subcategories=${includeSubcategories}`
        : `${backendUrl}/forms/users/form_by_user`;

      const logPrefix = forceRefresh ? "🌐 [REFRESH FORZADO]" : "🌐";
      console.log(`${logPrefix} Consultando formularios: ${cacheKey}`);
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();

      // ✅ VALIDAR respuesta
      if (!Array.isArray(data)) {
        console.warn("⚠️ Respuesta de formularios no es array");
        setCurrentForms([]);
        return;
      }

      const now = Date.now();
      console.log(
        `✅ ${data.length} formularios cargados desde endpoint (${cacheKey})`
      );

      setCurrentForms(data);

      // ✅ ACTUALIZAR CACHE para uso offline futuro
      try {
        const newCache = { ...formsCache, [cacheKey]: data };
        const newTimestamp = { ...formsTimestamp, [cacheKey]: now };
        setFormsCache(newCache);
        setFormsTimestamp(newTimestamp);

        // ✅ Guardar en AsyncStorage como respaldo para modo offline
        saveCacheToStorage(
          categoriesCache,
          newCache,
          categoriesTimestamp,
          newTimestamp
        );
        console.log(
          `💾 Respaldo guardado en AsyncStorage para uso offline (${cacheKey})`
        );
      } catch (cacheErr) {
        console.warn("⚠️ Error guardando respaldo:", cacheErr.message);
      }
    } catch (error) {
      console.error("❌ Error cargando formularios:", error);

      // Fallback a cache si existe
      if (formsCache[cacheKey]) {
        setCurrentForms(formsCache[cacheKey]);
      }
    } finally {
      // ✅ LIBERAR LOCK
      setIsLoadingForms(false);
    }
  };

  // Navegar a una categoría - OPTIMIZADO para respuesta rápida
  const navigateToCategory = async (category) => {
    try {
      if (category) {
        // ✅ ACTUALIZAR UI INMEDIATAMENTE
        setCurrentPath([...currentPath, category]);

        // ✅ CARGAR EN BACKGROUND sin esperar
        loadCategories(category.id).catch((err) => {
          console.error("❌ Error navegando a categoría:", err);
        });
        loadForms(category.id).catch((err) => {
          console.error("❌ Error cargando forms en categoría:", err);
        });
      } else {
        // Volver a raíz
        setCurrentPath([]);

        // ✅ CARGAR EN BACKGROUND sin esperar
        loadCategories(null).catch((err) => {
          console.error("❌ Error volviendo a raíz (categorías):", err);
        });
        loadForms(null).catch((err) => {
          console.error("❌ Error volviendo a raíz (forms):", err);
        });
      }
    } catch (error) {
      console.error("❌ Error crítico en navegación:", error);
    }
  };

  // Navegar a un índice del path - OPTIMIZADO para respuesta rápida
  const navigateToPathIndex = async (index) => {
    try {
      const newPath = currentPath.slice(0, index + 1);
      const targetCategory = newPath[newPath.length - 1];

      // ✅ ACTUALIZAR UI INMEDIATAMENTE
      setCurrentPath(newPath);

      // ✅ CARGAR EN BACKGROUND sin esperar
      loadCategories(targetCategory.id).catch((err) => {
        console.error("❌ Error en navegación breadcrumb (categorías):", err);
      });
      loadForms(targetCategory.id).catch((err) => {
        console.error("❌ Error en navegación breadcrumb (forms):", err);
      });
    } catch (error) {
      console.error("❌ Error crítico en navegación breadcrumb:", error);
    }
  };

  // Volver atrás
  const goBack = async () => {
    if (currentPath.length > 0) {
      const newPath = currentPath.slice(0, -1);
      setCurrentPath(newPath);
      const parentId =
        newPath.length > 0 ? newPath[newPath.length - 1].id : null;
      await loadCategories(parentId);
      await loadForms(parentId);
    }
  };

  // ✅ OPTIMIZADO: Filtrar formularios con useMemo (evita recalcular en cada render)
  const filteredForms = useMemo(() => {
    if (!searchTerm) return currentForms;

    const lowerSearch = searchTerm.toLowerCase();
    return currentForms.filter((form) =>
      form.title.toLowerCase().includes(lowerSearch)
    );
  }, [currentForms, searchTerm]);

  // ✅ OPTIMIZADO: Memoizar renderItem de FlatList
  const renderFormItem = useCallback(
    ({ item: form }) => (
      <FormItem form={form} onPress={() => onSelectForm(form)} />
    ),
    [onSelectForm]
  );

  // ✅ OPTIMIZADO: Memoizar keyExtractor
  const keyExtractor = useCallback((form) => form.id.toString(), []);

  return (
    <View style={styles.container}>
      {/* Breadcrumb Navigation */}
      <LinearGradient
        colors={["#12A0AF", "#0e8a96"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.breadcrumbContainer}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.breadcrumbScroll}
        >
          <TouchableOpacity
            style={styles.breadcrumbButton}
            onPress={() => navigateToCategory(null)}
          >
            <Text style={styles.breadcrumbHome}>🏠</Text>
          </TouchableOpacity>

          {currentPath.map((cat, index) => (
            <View key={cat.id} style={styles.breadcrumbItem}>
              <Text style={styles.breadcrumbSeparator}>›</Text>
              <TouchableOpacity
                style={styles.breadcrumbButton}
                onPress={() => navigateToPathIndex(index)}
              >
                <Text style={styles.breadcrumbText} numberOfLines={1}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </LinearGradient>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar formularios..."
          placeholderTextColor="#4B5563"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      {/* Content Area */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#12A0AF" />
            <Text style={styles.loadingText}>Cargando...</Text>
          </View>
        ) : (
          <>
            {/* Categories Grid */}
            {categories.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionIcon}>📁</Text>
                  <Text style={styles.sectionTitle}>
                    Folders ({categories.length})
                  </Text>
                </View>
                <View style={styles.categoriesGrid}>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={styles.categoryCard}
                      onPress={() => navigateToCategory(category)}
                      activeOpacity={0.7}
                    >
                      <LinearGradient
                        colors={["#E1F6F9", "#c1e6ec"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.categoryGradient}
                      >
                        <Text style={styles.categoryIcon}>📂</Text>
                        <View style={styles.categoryInfo}>
                          <Text style={styles.categoryName} numberOfLines={1}>
                            {category.name}
                          </Text>
                          <View style={styles.categoryMeta}>
                            <Text style={styles.categoryMetaText}>
                              {category.forms_count} formato
                              {category.forms_count !== 1 ? "s" : ""}
                            </Text>
                            {category.children_count > 0 && (
                              <Text style={styles.categoryMetaText}>
                                • {category.children_count} subcarpeta
                                {category.children_count !== 1 ? "s" : ""}
                              </Text>
                            )}
                          </View>
                        </View>
                        <Text style={styles.categoryArrow}>›</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Forms List */}
            {/* ✅ OPTIMIZADO: Lista de formularios virtualizada */}
            {filteredForms.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionIcon}>📄</Text>
                  <Text style={styles.sectionTitle}>
                    Formularios ({filteredForms.length})
                  </Text>
                </View>
                <FlatList
                  ref={flatListRef}
                  data={filteredForms}
                  keyExtractor={keyExtractor}
                  renderItem={renderFormItem}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  removeClippedSubviews={true}
                  scrollEnabled={false}
                  nestedScrollEnabled={true}
                  getItemLayout={(data, index) => ({
                    length: 95,
                    offset: 95 * index,
                    index,
                  })}
                />
              </View>
            )}

            {/* Empty State */}
            {categories.length === 0 && filteredForms.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📂</Text>
                <Text style={styles.emptyTitle}>Esta carpeta está vacía</Text>
                <Text style={styles.emptyText}>
                  No hay subcarpetas ni formularios en esta ubicación
                </Text>
                {currentPath.length > 0 && (
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={goBack}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.backButtonText}>← Volver atrás</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  breadcrumbContainer: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  breadcrumbScroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  breadcrumbButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  breadcrumbHome: {
    fontSize: 20,
  },
  breadcrumbItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  breadcrumbSeparator: {
    color: "#fff",
    fontSize: 18,
    marginHorizontal: 4,
    opacity: 0.6,
  },
  breadcrumbText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
    maxWidth: width * 0.3,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#222",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
  },
  categoriesGrid: {
    gap: 10,
  },
  categoryCard: {
    width: "100%", // ✅ Full width para que sean larguitas
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 10,
  },
  categoryGradient: {
    flexDirection: "row", // ✅ Cambiar a horizontal
    alignItems: "center",
    padding: 14,
    borderWidth: 2,
    borderColor: "#b4e3eb",
    borderRadius: 12,
  },
  categoryIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  categoryMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  categoryMetaText: {
    fontSize: 11,
    color: "#6B7280",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryArrow: {
    fontSize: 24,
    color: "#12A0AF",
    fontWeight: "700",
    marginLeft: 8,
  },
  formCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  formIconContainer: {
    width: 48,
    height: 48,
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  formIcon: {
    fontSize: 24,
  },
  formInfo: {
    flex: 1,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  formDescription: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 6,
  },
  formCategoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E1F6F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  formCategoryText: {
    fontSize: 11,
    color: "#12A0AF",
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: "#12A0AF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: "#12A0AF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
