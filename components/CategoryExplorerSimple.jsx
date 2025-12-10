import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");

const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

// Componente de Breadcrumb (ruta de navegación)
const Breadcrumb = ({ path, onNavigate }) => (
  <View style={styles.breadcrumb}>
    <TouchableOpacity onPress={() => onNavigate(-1)}>
      <Text style={styles.breadcrumbItem}>🏠 Inicio</Text>
    </TouchableOpacity>
    {path.map((category, index) => (
      <View key={category.id} style={styles.breadcrumbSection}>
        <Text style={styles.breadcrumbSeparator}> / </Text>
        <TouchableOpacity onPress={() => onNavigate(index)}>
          <Text style={styles.breadcrumbItem}>{category.name}</Text>
        </TouchableOpacity>
      </View>
    ))}
  </View>
);

// Tarjeta de Categoría
const CategoryCard = ({ category, onPress }) => (
  <TouchableOpacity
    style={styles.categoryCard}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={styles.categoryIcon}>
      <Text style={styles.categoryIconText}>📁</Text>
    </View>
    <View style={styles.categoryInfo}>
      <Text style={styles.categoryName}>{category.name}</Text>
      {category.description && (
        <Text style={styles.categoryDescription} numberOfLines={2}>
          {category.description}
        </Text>
      )}
      <View style={styles.categoryStats}>
        {category.children_count > 0 && (
          <Text style={styles.categoryStat}>
            📂 {category.children_count} subcategorías
          </Text>
        )}
        {category.forms_count > 0 && (
          <Text style={styles.categoryStat}>
            📋 {category.forms_count} formularios
          </Text>
        )}
      </View>
    </View>
    <Text style={styles.categoryArrow}>›</Text>
  </TouchableOpacity>
);

// Tarjeta de Formulario
const FormCard = ({ form, onPress }) => (
  <TouchableOpacity
    style={styles.formCard}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={styles.formIcon}>
      <Text style={styles.formIconText}>📋</Text>
    </View>
    <View style={styles.formInfo}>
      <Text style={styles.formTitle} numberOfLines={1}>
        {form.title}
      </Text>
      <Text style={styles.formDescription} numberOfLines={2}>
        {form.description || "Sin descripción"}
      </Text>
    </View>
  </TouchableOpacity>
);

export default function CategoryExplorerSimple({
  onSelectForm,
  refreshTrigger,
}) {
  const [categories, setCategories] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [currentForms, setCurrentForms] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryTotalPages, setCategoryTotalPages] = useState(1);
  const CATEGORY_PAGE_SIZE = 10;

  // Cargar categorías al inicio
  useEffect(() => {
    loadCategories(null);
  }, []);

  // Refrescar cuando cambia el trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      const currentCategoryId =
        currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
      loadCategories(currentCategoryId);
      if (currentCategoryId) {
        loadFormsByCategory(currentCategoryId, 1);
      }
    }
  }, [refreshTrigger]);

  const loadCategories = async (parentId, page = 1) => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      const backendUrl = await getBackendUrl();

      const url = parentId
        ? `${backendUrl}/forms/categories/by-parent?parent_id=${parentId}&page=${page}&page_size=${CATEGORY_PAGE_SIZE}`
        : `${backendUrl}/forms/categories/by-parent?page=${page}&page_size=${CATEGORY_PAGE_SIZE}`;

      console.log(
        `🌐 [CategoryExplorer] Cargando categorías: ${parentId || "root"}`
      );

      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();

      // Si la respuesta tiene paginación
      if (data.items && Array.isArray(data.items)) {
        setCategories(data.items);
        setCategoryPage(data.page || 1);
        setCategoryTotalPages(data.total_pages || 1);
        console.log(`✅ ${data.items.length} categorías cargadas`);
      } else if (Array.isArray(data)) {
        // Respuesta sin paginación (array directo)
        setCategories(data);
        setCategoryPage(1);
        setCategoryTotalPages(1);
        console.log(`✅ ${data.length} categorías cargadas`);
      }
    } catch (error) {
      console.error("❌ Error cargando categorías:", error);
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFormsByCategory = async (categoryId, page = 1) => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      const backendUrl = await getBackendUrl();

      const url = `${backendUrl}/forms/categories/${categoryId}/forms?include_subcategories=false&page=${page}&page_size=10`;

      console.log(
        `🌐 [CategoryExplorer] Cargando formularios de categoría ${categoryId}`
      );

      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();

      if (data.items && Array.isArray(data.items)) {
        setCurrentForms(data.items);
        console.log(`✅ ${data.items.length} formularios cargados`);
      } else if (Array.isArray(data)) {
        setCurrentForms(data);
        console.log(`✅ ${data.length} formularios cargados`);
      }
    } catch (error) {
      console.error("❌ Error cargando formularios:", error);
      setCurrentForms([]);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToCategory = async (category) => {
    const newPath = [...currentPath, category];
    setCurrentPath(newPath);
    setCurrentForms([]);
    await loadCategories(category.id);
    await loadFormsByCategory(category.id, 1);
  };

  const navigateToPathIndex = async (index) => {
    if (index === -1) {
      // Volver a raíz
      setCurrentPath([]);
      setCurrentForms([]);
      await loadCategories(null);
    } else {
      // Navegar a una posición específica en el path
      const newPath = currentPath.slice(0, index + 1);
      const target = newPath[newPath.length - 1];
      setCurrentPath(newPath);
      setCurrentForms([]);
      await loadCategories(target.id);
      await loadFormsByCategory(target.id, 1);
    }
  };

  const changeCategoryPage = async (page) => {
    const currentCategoryId =
      currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
    await loadCategories(currentCategoryId, page);
  };

  return (
    <View style={styles.container}>
      {/* Breadcrumb - Ruta de navegación */}
      <Breadcrumb path={currentPath} onNavigate={navigateToPathIndex} />

      {/* Loader */}
      {isLoading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#4B34C7" />
          <Text style={styles.loaderText}>Cargando...</Text>
        </View>
      )}

      {/* Contenido */}
      {!isLoading && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Categorías */}
          {categories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📂 Categorías</Text>
              {categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  onPress={() => navigateToCategory(category)}
                />
              ))}

              {/* Paginación de categorías */}
              {categoryTotalPages > 0 && (
                <View style={styles.pagination}>
                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      categoryPage === 1 && styles.paginationButtonDisabled,
                    ]}
                    onPress={() => changeCategoryPage(categoryPage - 1)}
                    disabled={categoryPage === 1}
                  >
                    <Text style={styles.paginationButtonText}>Anterior</Text>
                  </TouchableOpacity>

                  <Text style={styles.paginationText}>
                    Página {categoryPage} de {categoryTotalPages}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      categoryPage === categoryTotalPages &&
                        styles.paginationButtonDisabled,
                    ]}
                    onPress={() => changeCategoryPage(categoryPage + 1)}
                    disabled={categoryPage === categoryTotalPages}
                  >
                    <Text style={styles.paginationButtonText}>Siguiente</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Formularios */}
          {currentForms.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📋 Formularios</Text>
              {currentForms.map((form) => (
                <FormCard
                  key={form.id}
                  form={form}
                  onPress={() => onSelectForm(form)}
                />
              ))}
            </View>
          )}

          {/* Mensaje cuando no hay contenido */}
          {!isLoading &&
            categories.length === 0 &&
            currentForms.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>📭</Text>
                <Text style={styles.emptyStateText}>
                  {currentPath.length === 0
                    ? "No hay categorías disponibles"
                    : "Esta categoría está vacía"}
                </Text>
              </View>
            )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  breadcrumb: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.015,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  breadcrumbSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  breadcrumbItem: {
    color: "#4B34C7",
    fontSize: width * 0.038,
    fontWeight: "500",
  },
  breadcrumbSeparator: {
    color: "#9ca3af",
    fontSize: width * 0.038,
    marginHorizontal: 4,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  loaderText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 12,
  },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: width * 0.04,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryIcon: {
    width: width * 0.13,
    height: width * 0.13,
    borderRadius: (width * 0.13) / 2,
    backgroundColor: "#ede9fe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  categoryIconText: {
    fontSize: width * 0.065,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: width * 0.042,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: width * 0.035,
    color: "#6b7280",
    marginBottom: 6,
  },
  categoryStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryStat: {
    fontSize: width * 0.032,
    color: "#9ca3af",
  },
  categoryArrow: {
    fontSize: width * 0.065,
    color: "#9ca3af",
    marginLeft: 8,
  },
  formCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: width * 0.04,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  formIcon: {
    width: width * 0.13,
    height: width * 0.13,
    borderRadius: (width * 0.13) / 2,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  formIconText: {
    fontSize: width * 0.065,
  },
  formInfo: {
    flex: 1,
  },
  formTitle: {
    fontSize: width * 0.042,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  formDescription: {
    fontSize: width * 0.035,
    color: "#6b7280",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    gap: width * 0.02,
    paddingHorizontal: width * 0.02,
  },
  paginationButton: {
    backgroundColor: "#4B34C7",
    paddingHorizontal: width * 0.03,
    paddingVertical: height * 0.009,
    borderRadius: 8,
    minWidth: width * 0.18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  paginationButtonDisabled: {
    backgroundColor: "#d1d5db",
    opacity: 0.6,
  },
  paginationButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: width * 0.032,
  },
  paginationText: {
    color: "#374151",
    fontSize: width * 0.033,
    fontWeight: "600",
    paddingHorizontal: width * 0.015,
  },
});
