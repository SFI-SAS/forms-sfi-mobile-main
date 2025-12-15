import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  BackHandler,
  Dimensions,
  Animated,
  Easing,
  Image,
  TextInput,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { getFormsByUser } from "../services/api";
import CategoryExplorerSimple from "./CategoryExplorerSimple";
import { isOnline } from "../services/offlineManager";
import ConnectionIndicator from "./ConnectionIndicator";

const { width, height } = Dimensions.get("window");

const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

// Tarjeta de formulario - Memoizada
const FormCard = React.memo(({ form, onPress }) => (
  <TouchableOpacity
    style={styles.formCard}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <View style={styles.formCardHeader}>
      <Image
        source={require("../assets/form_icon.png")}
        style={styles.formCardIcon}
        resizeMode="contain"
      />
      <Text style={styles.formCardTitle} numberOfLines={1}>
        {form.title}
      </Text>
    </View>
    <Text style={styles.formCardDesc} numberOfLines={2}>
      {form.description}
    </Text>
  </TouchableOpacity>
));

export default function Forms() {
  const router = useRouter();
  const [userForms, setUserForms] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spinAnim] = useState(new Animated.Value(0));
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [useCategoryExplorer, setUseCategoryExplorer] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 🔥 PAGINACIÓN - Como en versión PC (solo para vista de lista)
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const PAGE_SIZE = 20;

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        disableBack
      );
      return () => subscription.remove();
    }, [])
  );

  // Manejar selección de formulario
  const handleFormPress = (form) => {
    console.log("📋 Formulario seleccionado:", form.id);
    router.push({
      pathname: "/format-screen",
      params: {
        id: form.id,
        created_at: form.created_at,
        title: form.title,
      },
    });
  };

  // 🔥 CARGAR FORMULARIOS CON PAGINACIÓN - Sistema offline/online
  const loadForms = async (pageNumber = 1) => {
    try {
      setLoading(true);

      // Detectar estado de conexión
      const online = await isOnline();
      setIsOffline(!online);
      console.log(
        `📋 [Forms] Modo: ${online ? "🌐 ONLINE" : "📵 OFFLINE"} - Página ${pageNumber}`
      );

      let formsData = [];

      if (online) {
        // MODO ONLINE: Usar endpoint + actualizar caché
        try {
          console.log("🌐 [ONLINE] Obteniendo formularios desde API...");

          const result = await getFormsByUser(pageNumber, PAGE_SIZE);

          if (result && result.items) {
            formsData = result.items;
            setTotalItems(result.total);
            setTotalPages(result.totalPages);
            setCurrentPage(pageNumber);

            // 💾 Guardar TODAS las páginas vistas en caché acumulativo
            const cacheKey = `offline_forms_all_pages`;
            const storedPages = await AsyncStorage.getItem(cacheKey);
            let allPages = storedPages ? JSON.parse(storedPages) : {};

            // Guardar esta página específica
            allPages[`page_${pageNumber}`] = result.items;
            await AsyncStorage.setItem(cacheKey, JSON.stringify(allPages));

            // También mantener compatibilidad con caché simple (página 1)
            if (pageNumber === 1) {
              await AsyncStorage.setItem(
                "offline_forms",
                JSON.stringify(result.items)
              );
            }

            console.log(
              `✅ [ONLINE] ${result.items.length} formularios página ${pageNumber} + caché actualizado`
            );
          }
        } catch (error) {
          console.error("❌ [ONLINE] Error obteniendo formularios:", error);
          // Fallback a caché si falla
          const cacheKey = `offline_forms_all_pages`;
          const storedPages = await AsyncStorage.getItem(cacheKey);
          if (storedPages) {
            const allPages = JSON.parse(storedPages);
            formsData = allPages[`page_${pageNumber}`] || [];
            console.log("⚠️ [ONLINE] Usando caché por error en API");
          }
        }
      } else {
        // MODO OFFLINE: Cargar todas las páginas guardadas con paginación local
        console.log("📵 [OFFLINE] Obteniendo formularios desde caché...");
        try {
          const cacheKey = `offline_forms_all_pages`;
          const storedPages = await AsyncStorage.getItem(cacheKey);

          if (storedPages) {
            const allPages = JSON.parse(storedPages);
            const pageData = allPages[`page_${pageNumber}`];

            if (pageData) {
              formsData = pageData;

              // Calcular total de páginas disponibles offline
              const availablePages = Object.keys(allPages).length;
              setTotalPages(availablePages);

              // Calcular total aproximado de items
              const totalOfflineItems = Object.values(allPages).reduce(
                (sum, items) => sum + items.length,
                0
              );
              setTotalItems(totalOfflineItems);
              setCurrentPage(pageNumber);

              console.log(
                `✅ [OFFLINE] ${formsData.length} formularios página ${pageNumber}/${availablePages} desde caché`
              );
            } else {
              console.warn(
                `⚠️ [OFFLINE] Página ${pageNumber} no disponible en caché`
              );
            }
          } else {
            // Fallback al caché simple (solo página 1)
            const stored = await AsyncStorage.getItem("offline_forms");
            if (stored && pageNumber === 1) {
              formsData = JSON.parse(stored);
              setTotalItems(formsData.length);
              setTotalPages(1);
              setCurrentPage(1);
              console.log(
                `✅ [OFFLINE] ${formsData.length} formularios desde caché simple`
              );
            } else {
              console.warn("⚠️ [OFFLINE] No hay formularios en caché");
            }
          }
        } catch (error) {
          console.error("❌ [OFFLINE] Error leyendo caché:", error);
        }
      }

      setUserForms(formsData);
    } catch (error) {
      console.error("❌ [Forms] Error general:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Cargar inicial
  useEffect(() => {
    loadForms(1);
  }, []);

  // Detectar conectividad
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // Animación de spinner
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [loading]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Refreshar
  const refreshAll = async () => {
    setRefreshing(true);
    if (useCategoryExplorer) {
      setRefreshTrigger((prev) => prev + 1);
      setRefreshing(false);
    } else {
      await loadForms(currentPage);
    }
  };

  // Cambiar de página
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      loadForms(page);
    }
  };

  // Filtrar formularios por búsqueda con debounce
  useEffect(() => {
    if (searchText.trim() === "") {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      const text = searchText.trim().toLowerCase();
      const results = userForms.filter(
        (form) =>
          (form.title && form.title.toLowerCase().includes(text)) ||
          (form.description && form.description.toLowerCase().includes(text))
      );
      setSearchResults(results);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchText, userForms]);

  // Lista a mostrar
  const displayForms = searchText.trim() !== "" ? searchResults : userForms;

  return (
    <LinearGradient
      colors={["#4B34C7", "#4B34C7"]}
      style={styles.fullBackground}
    >
      {/* Indicador de conexión */}
      <ConnectionIndicator />

      <View style={styles.container}>
        {/* Apartado de búsqueda - Solo en vista de lista */}
        {!useCategoryExplorer && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Buscar formato"
              value={searchText}
              onChangeText={setSearchText}
              placeholderTextColor="#4B5563"
            />
          </View>
        )}

        {/* Título y controles */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitleWhite}>Assigned forms</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[
                styles.toggleViewButton,
                useCategoryExplorer && styles.toggleViewButtonActive,
              ]}
              onPress={() => setUseCategoryExplorer(!useCategoryExplorer)}
              activeOpacity={0.8}
            >
              <Text style={styles.toggleViewIcon}>
                {useCategoryExplorer ? "📂 Folders" : "📋 List"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.refreshButton,
                (refreshing || loading) && styles.refreshButtonDisabled,
              ]}
              onPress={refreshAll}
              disabled={refreshing || loading}
              activeOpacity={0.8}
            >
              <Image
                source={require("../assets/sync_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
                style={styles.refreshIcon}
                resizeMode="contain"
              />
              <Text style={styles.refreshLabel}>
                {refreshing ? "Updating..." : "Refresh"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Información de paginación - Solo en vista de lista */}
        {!useCategoryExplorer && !searchText && totalItems > 0 && (
          <View style={styles.paginationInfoContainer}>
            <Text style={styles.paginationInfo}>
              Mostrando {userForms.length} de {totalItems} formularios
            </Text>
            <Text style={styles.paginationPageInfo}>
              Página {currentPage} de {totalPages}
            </Text>
          </View>
        )}

        {/* Contenedor principal */}
        {loading && !useCategoryExplorer ? (
          <View style={styles.loadingContainer}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <SvgXml
                xml={spinnerSvg.replace("#000000FF", "#fff")}
                width={50}
                height={50}
              />
            </Animated.View>
            <Text style={styles.loadingTextWhite}>Loading...</Text>
          </View>
        ) : (
          <>
            {/* Vista de Carpetas (CategoryExplorer) */}
            {useCategoryExplorer && (
              <View style={styles.categoryExplorerWrapper}>
                <CategoryExplorerSimple
                  onSelectForm={handleFormPress}
                  refreshTrigger={refreshTrigger}
                />
              </View>
            )}

            {/* Vista de Lista con Paginación */}
            {!useCategoryExplorer && (
              <View style={styles.listViewContainer}>
                <View style={styles.formsScrollWrapper}>
                  <LinearGradient
                    colors={[
                      "#fff",
                      "#fff",
                      "#e6fafd",
                      "#e6fafd",
                      "#e6fafd",
                      "#e6fafd",
                      "#12A0AF",
                    ]}
                    locations={[0, 0.7, 0.85, 0.92, 0.96, 0.98, 1]}
                    start={{ x: 0.6, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.formsGradientBg}
                  >
                    <ScrollView
                      style={styles.formsContainer}
                      contentContainerStyle={styles.formsContentContainer}
                      showsVerticalScrollIndicator={false}
                    >
                      {displayForms.length === 0 ? (
                        <Text style={styles.loadingText}>
                          {searchText
                            ? "No se encontraron formatos."
                            : "No hay formularios asignados."}
                        </Text>
                      ) : (
                        displayForms.map((form) => (
                          <View key={form.id} style={styles.formCardWrapper}>
                            <FormCard
                              form={form}
                              onPress={() => handleFormPress(form)}
                            />
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </LinearGradient>
                </View>

                {/* Controles de paginación */}
                {!searchText && totalItems > 0 && (
                  <View style={styles.paginationControls}>
                    {/* Botones de navegación principales */}
                    <View style={styles.paginationNavigation}>
                      <TouchableOpacity
                        style={[
                          styles.paginationButton,
                          currentPage === 1 && styles.paginationButtonDisabled,
                        ]}
                        onPress={() => goToPage(1)}
                        disabled={currentPage === 1}
                      >
                        <Text style={styles.paginationButtonText}>⏮</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.paginationButton,
                          currentPage === 1 && styles.paginationButtonDisabled,
                        ]}
                        onPress={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        <Text style={styles.paginationButtonText}>←</Text>
                      </TouchableOpacity>

                      <View style={styles.paginationCurrentPage}>
                        <Text style={styles.paginationCurrentPageText}>
                          {currentPage}
                        </Text>
                        <Text style={styles.paginationTotalPages}>
                          de {totalPages}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.paginationButton,
                          currentPage === totalPages &&
                            styles.paginationButtonDisabled,
                        ]}
                        onPress={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                      >
                        <Text style={styles.paginationButtonText}>→</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.paginationButton,
                          currentPage === totalPages &&
                            styles.paginationButtonDisabled,
                        ]}
                        onPress={() => goToPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        <Text style={styles.paginationButtonText}>⏭</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Números de página clickeables */}
                    {totalPages > 1 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.paginationNumbers}
                      >
                        {Array.from(
                          { length: Math.min(totalPages, 10) },
                          (_, i) => {
                            let pageNum;
                            if (totalPages <= 10) {
                              pageNum = i + 1;
                            } else if (currentPage <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 4) {
                              pageNum = totalPages - 9 + i;
                            } else {
                              pageNum = currentPage - 4 + i;
                            }

                            return (
                              <TouchableOpacity
                                key={pageNum}
                                style={[
                                  styles.pageNumberButton,
                                  currentPage === pageNum &&
                                    styles.pageNumberButtonActive,
                                ]}
                                onPress={() => goToPage(pageNum)}
                              >
                                <Text
                                  style={[
                                    styles.pageNumberText,
                                    currentPage === pageNum &&
                                      styles.pageNumberTextActive,
                                  ]}
                                >
                                  {pageNum}
                                </Text>
                              </TouchableOpacity>
                            );
                          }
                        )}
                      </ScrollView>
                    )}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fullBackground: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  sectionTitleWhite: {
    fontSize: width * 0.055,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 0.2,
    textShadowColor: "#0002",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: width * 0.04,
    marginTop: 8,
    marginBottom: 8,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#12A0AF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshIcon: {
    width: width * 0.05,
    height: width * 0.05,
    tintColor: "#fff",
    marginRight: 6,
  },
  refreshLabel: {
    color: "#fff",
    fontWeight: "bold",
  },
  paginationInfo: {
    color: "#e2e8f0",
    textAlign: "center",
    paddingHorizontal: width * 0.04,
    marginBottom: 8,
    fontSize: width * 0.032,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    marginTop: height * 0.1,
  },
  listViewContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: height * 0.11,
  },
  scrollView: {
    flex: 1,
  },
  formsScrollWrapper: {
    flex: 1,
    marginHorizontal: width * 0.03,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: width * 0.035,
    overflow: "hidden",
  },
  formsGradientBg: {
    flex: 1,
    borderRadius: width * 0.035,
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  formsContainer: {
    flex: 1,
  },
  formsContentContainer: {
    paddingBottom: 10,
    paddingHorizontal: width * 0.03,
  },
  formCardWrapper: {
    marginBottom: height * 0.018,
    borderRadius: width * 0.035,
    overflow: "visible",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    backgroundColor: "transparent",
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: width * 0.035,
    padding: width * 0.04,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  formCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  formCardIcon: {
    width: width * 0.08,
    height: width * 0.08,
    marginRight: 10,
    tintColor: "#12A0AF",
  },
  formCardTitle: {
    fontSize: width * 0.042,
    fontWeight: "bold",
    color: "#4B34C7",
    flex: 1,
  },
  formCardDesc: {
    fontSize: width * 0.032,
    color: "#444",
    marginTop: 2,
  },
  loadingText: {
    fontSize: width * 0.045,
    textAlign: "center",
    marginVertical: height * 0.02,
    color: "#4B34C7",
  },
  loadingTextWhite: {
    fontSize: width * 0.045,
    textAlign: "center",
    marginTop: 12,
    color: "#fff",
  },
  searchContainer: {
    marginHorizontal: width * 0.04,
    marginBottom: 12,
    marginTop: height * 0.02,
    backgroundColor: "#fff",
    borderRadius: width * 0.03,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchInput: {
    fontSize: width * 0.042,
    color: "#222",
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  paginationControls: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    padding: width * 0.02,
    marginHorizontal: width * 0.02,
    marginVertical: 8,
  },
  paginationButton: {
    backgroundColor: "#12A0AF",
    paddingHorizontal: width * 0.02,
    paddingVertical: height * 0.008,
    borderRadius: 8,
    minWidth: width * 0.1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  paginationButtonDisabled: {
    backgroundColor: "rgba(150, 150, 150, 0.5)",
    opacity: 0.6,
  },
  paginationButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  paginationText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    marginHorizontal: 8,
  },
  paginationInfoContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 8,
    alignItems: "center",
    gap: 6,
  },
  paginationPageInfo: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.95,
  },
  paginationNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: width * 0.012,
    marginBottom: 8,
  },
  paginationCurrentPage: {
    backgroundColor: "#4B34C7",
    paddingHorizontal: width * 0.025,
    paddingVertical: height * 0.01,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: width * 0.12,
    marginHorizontal: width * 0.01,
    shadowColor: "#4B34C7",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  paginationCurrentPageText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.042,
  },
  paginationTotalPages: {
    color: "#fff",
    fontSize: width * 0.025,
    opacity: 0.9,
    marginTop: 1,
  },
  paginationNumbers: {
    flexDirection: "row",
    gap: width * 0.01,
    paddingVertical: 8,
    paddingHorizontal: width * 0.01,
    justifyContent: "center",
  },
  pageNumberButton: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    width: width * 0.08,
    height: width * 0.08,
    borderRadius: (width * 0.08) / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  pageNumberButtonActive: {
    backgroundColor: "#4B34C7",
    borderColor: "#fff",
    borderWidth: 2,
    transform: [{ scale: 1.1 }],
  },
  pageNumberText: {
    color: "#fff",
    fontSize: width * 0.032,
    fontWeight: "600",
  },
  pageNumberTextActive: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.035,
  },
  toggleViewButton: {
    backgroundColor: "#12A0AF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
  toggleViewButtonActive: {
    backgroundColor: "#0e8a96",
  },
  toggleViewIcon: {
    fontSize: 16,
    color: "#fff",
  },
  categoryExplorerWrapper: {
    flex: 1,
    marginHorizontal: width * 0.03,
    marginTop: 12,
    marginBottom: height * 0.015,
    borderRadius: width * 0.035,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
