import React, { useEffect, useState, useRef } from "react";
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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { parseFormDesignToQuestions } from "../utils/formDesignParser";
import CategoryExplorer from "./CategoryExplorer";
import {
  getMultipleItems,
  getMultipleItemsParsed,
} from "../utils/asyncStorageHelper";

const { width, height } = Dimensions.get("window");

// Spinner SVG
const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

const QUESTIONS_KEY = "offline_questions";
const FORMS_METADATA_KEY = "offline_forms_metadata";
const RELATED_ANSWERS_KEY = "offline_related_answers";
const BACKEND_URL_KEY = "backend_url";
const APP_FIRST_LOAD_DONE_KEY = "app_first_load_done";

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

// Tarjeta de formulario - Memoizada para evitar re-renders
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

// Componente para categorías - Memoizado para evitar re-renders
const CategoryCard = React.memo(
  ({ category, onToggle, isExpanded, onFormPress }) => (
    <View style={styles.categoryContainer}>
      <TouchableOpacity
        style={styles.categoryHeader}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <View style={styles.categoryTitleContainer}>
          <Text style={styles.categoryTitle}>{category.name}</Text>
          <Text style={styles.categoryCount}>
            ({category.forms.length} formato
            {category.forms.length !== 1 ? "s" : ""})
          </Text>
        </View>
        <Text style={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.formsInCategory}>
          {category.forms.map((form) => (
            <View key={form.id} style={styles.formCardWrapper}>
              <FormCard form={form} onPress={() => onFormPress(form)} />
            </View>
          ))}
        </View>
      )}
    </View>
  )
);

export default function Forms() {
  const router = useRouter();
  const [userForms, setUserForms] = useState([]);
  const [categorizedForms, setCategorizedForms] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spinAnim] = useState(new Animated.Value(0));
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [useCategoryExplorer, setUseCategoryExplorer] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        disableBack
      );
      return () => {
        subscription.remove();
      };
    }, [])
  );

  // Organizar formularios por categorías
  const organizeByCategorys = (formsList) => {
    const categoriesMap = {};

    formsList.forEach((form) => {
      const categoryName = form.category?.name || "Sin Categoría";
      const categoryId = form.category?.id || "no-category";

      if (!categoriesMap[categoryId]) {
        categoriesMap[categoryId] = {
          id: categoryId,
          name: categoryName,
          forms: [],
        };
      }

      categoriesMap[categoryId].forms.push(form);
    });

    const categoriesArray = Object.values(categoriesMap).sort((a, b) => {
      if (a.id === "no-category") return 1;
      if (b.id === "no-category") return -1;
      return a.name.localeCompare(b.name);
    });

    setCategorizedForms(categoriesArray);
  };

  // Alternar expansión de categoría
  const toggleCategory = (categoryId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

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

  // Pre-cargar datos desde cache
  const preloadCriticalData = async () => {
    try {
      const storedForms = await AsyncStorage.getItem("offline_forms");
      if (storedForms) {
        const forms = JSON.parse(storedForms);
        setUserForms(forms);
        organizeByCategorys(forms);
        setLoading(false);
      }
    } catch (error) {
      console.error("Error cargando formularios:", error);
      setLoading(false);
    }
  };

  const loadOfflineForms = async () => {
    try {
      const storedForms = await AsyncStorage.getItem("offline_forms");
      if (storedForms) {
        const forms = JSON.parse(storedForms);
        setUserForms(forms);
        organizeByCategorys(forms);
      }
    } catch (error) {
      console.error("Error cargando formularios offline:", error);
    } finally {
      setLoading(false);
    }
  };

  // Pre-cargar inmediatamente desde cache
  useEffect(() => {
    preloadCriticalData();
  }, []);

  // useEffect principal
  useEffect(() => {
    const controlledInitialFetch = async () => {
      const state = await NetInfo.fetch();
      setIsOffline(!state.isConnected);

      try {
        const ts = await AsyncStorage.getItem("last_sync_at");
        if (ts) setLastSyncAt(ts);
      } catch (_) {}

      const firstLoadDone = await AsyncStorage.getItem(APP_FIRST_LOAD_DONE_KEY);
      if (!firstLoadDone || firstLoadDone !== "true") {
        console.log(
          "🚀 Primera carga - datos ya deberían estar cargados desde Home"
        );
      }

      await loadOfflineForms();
    };

    controlledInitialFetch();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  // Refrescar
  const refreshAll = async () => {
    setRefreshing(true);
    await loadOfflineForms();
    setRefreshTrigger((prev) => prev + 1);
    setRefreshing(false);
  };

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

  // Filtrar formularios por búsqueda con debounce
  useEffect(() => {
    if (searchText.trim() === "") {
      setSearchResults([]);
      return;
    }

    // Debounce: esperar 300ms después del último keystroke
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

  return (
    <LinearGradient
      colors={["#4B34C7", "#4B34C7"]}
      style={styles.fullBackground}
    >
      <View style={styles.container}>
        {/* Apartado de búsqueda */}
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
          <Text
            style={[
              styles.sectionTitleWhite,
              { marginTop: 0, marginBottom: 0 },
            ]}
          >
            Assigned forms
          </Text>
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
                {useCategoryExplorer ? "📋 List" : "📂 Folders"}
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
        {lastSyncAt && (
          <Text style={styles.lastSyncText} numberOfLines={1}>
            Last sync: {new Date(lastSyncAt).toLocaleString()}
          </Text>
        )}

        {/* Contenedor principal */}
        {loading ? (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              marginTop: height * 0.1,
            }}
          >
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
            <View
              style={[
                styles.categoryExplorerWrapper,
                !useCategoryExplorer && { display: "none" },
              ]}
            >
              <CategoryExplorer
                onSelectForm={handleFormPress}
                refreshTrigger={refreshTrigger}
              />
            </View>

            {!useCategoryExplorer && (
              <ScrollView
                contentContainerStyle={{
                  flexGrow: 1,
                  paddingBottom: height * 0.11,
                }}
                style={{ flex: 1 }}
              >
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
                      contentContainerStyle={{
                        paddingBottom: 10,
                        paddingHorizontal: width * 0.03,
                      }}
                      showsVerticalScrollIndicator={false}
                      horizontal={false}
                    >
                      {searchText.trim() !== "" ? (
                        searchResults.length === 0 ? (
                          <Text style={styles.loadingText}>
                            No se encontraron formatos.
                          </Text>
                        ) : (
                          searchResults.map((form) => (
                            <View key={form.id} style={styles.formCardWrapper}>
                              <FormCard
                                form={form}
                                onPress={() => handleFormPress(form)}
                              />
                            </View>
                          ))
                        )
                      ) : (
                        categorizedForms.map((category) => (
                          <CategoryCard
                            key={category.id}
                            category={category}
                            isExpanded={!!expandedCategories[category.id]}
                            onToggle={() => toggleCategory(category.id)}
                            onFormPress={handleFormPress}
                          />
                        ))
                      )}
                    </ScrollView>
                  </LinearGradient>
                </View>
              </ScrollView>
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
    position: "relative",
    paddingBottom: 0,
  },
  sectionTitleWhite: {
    fontSize: width * 0.055,
    fontWeight: "bold",
    color: "#fff",
    marginTop: height * 0.02,
    marginBottom: 12,
    textAlign: "center",
    letterSpacing: 0.2,
    zIndex: 1,
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
  lastSyncText: {
    color: "#e2e8f0",
    textAlign: "right",
    paddingHorizontal: width * 0.04,
    marginTop: 4,
    fontSize: width * 0.03,
  },
  formsScrollWrapper: {
    flex: 1,
    marginHorizontal: width * 0.03,
    marginTop: 12,
    marginBottom: height * 0.015,
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
    flexGrow: 0,
    maxHeight: height * 0.5,
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
  categoryContainer: {
    marginBottom: height * 0.02,
    borderRadius: width * 0.035,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  categoryHeader: {
    backgroundColor: "#f7f7f9",
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryTitle: {
    fontSize: width * 0.04,
    fontWeight: "bold",
    color: "#333",
    marginRight: 7,
  },
  categoryCount: {
    fontSize: width * 0.035,
    color: "#666",
    fontWeight: "500",
  },
  expandIcon: {
    fontSize: width * 0.045,
    color: "#12A0AF",
    lineHeight: 24,
  },
  formsInCategory: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
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
    fontSize: 18,
    color: "#fff",
  },
});
