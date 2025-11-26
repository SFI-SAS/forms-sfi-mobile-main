import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import Svg, { Circle, G, Text as SvgText } from "react-native-svg";
import { useRouter } from "expo-router";

const { width, height } = Dimensions.get("window");

// Memoize skeleton component
const SkeletonListItem = React.memo(() => (
  <View style={styles.skeletonListItem}>
    <View style={styles.skeletonTitle} />
    <View style={styles.skeletonSubtitle} />
    <View style={styles.skeletonDate} />
  </View>
));

// Memoize PieChart component
const PieChart = React.memo(({ data, size = 160 }) => {
  const radius = size / 2 - 15;
  const circumference = 2 * Math.PI * radius;
  const svgSize = size + 30;

  let currentAngle = -90;

  const total = useMemo(
    () => data.reduce((sum, d) => sum + d.value, 0),
    [data]
  );

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
        width: "100%",
      }}
    >
      <Svg
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        width={svgSize}
        height={svgSize}
      >
        <G rotation={0} origin={`${svgSize / 2}, ${svgSize / 2}`}>
          {data.map((item, index) => {
            const percentage = item.value / total;
            const angle = percentage * 360;

            const startAngle = currentAngle;
            currentAngle += angle;

            return (
              <Circle
                key={`${item.name}-${index}`}
                cx={svgSize / 2}
                cy={svgSize / 2}
                r={radius}
                stroke={item.color}
                strokeWidth={25}
                fill="transparent"
                strokeDasharray={`${circumference * percentage} ${circumference}`}
                strokeDashoffset={0}
                rotation={startAngle}
                origin={`${svgSize / 2}, ${svgSize / 2}`}
              />
            );
          })}
        </G>
        <Circle cx={svgSize / 2} cy={svgSize / 2} r={radius - 30} fill="#fff" />
        <SvgText
          x={svgSize / 2}
          y={svgSize / 2 - 5}
          textAnchor="middle"
          fontSize="16"
          fontWeight="bold"
          fill="#333"
          dy="8"
        >
          Total
        </SvgText>
        <SvgText
          x={svgSize / 2}
          y={svgSize / 2 + 12}
          textAnchor="middle"
          fontSize="14"
          fill="#666"
          dy="8"
        >
          {total}
        </SvgText>
      </Svg>

      <View
        style={{
          marginTop: 12,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 8,
        }}
      >
        {data.map((item, index) => (
          <View
            key={`legend-${item.name}-${index}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginRight: 8,
              marginBottom: 4,
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                backgroundColor: item.color,
                borderRadius: 2,
                marginRight: 4,
              }}
            />
            <Text style={{ fontSize: 10, color: "#666" }}>
              {item.name}: {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

// Memoize BarChart component
const HorizontalBarChart = React.memo(({ data, maxValue }) => {
  return (
    <View style={{ paddingVertical: 4 }}>
      {data.map((item, index) => {
        const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

        return (
          <View key={`bar-${item.name}-${index}`} style={{ marginBottom: 10 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text style={{ fontSize: 11, color: "#333", fontWeight: "500" }}>
                {item.name}
              </Text>
              <Text style={{ fontSize: 11, color: "#666", fontWeight: "bold" }}>
                {item.value}
              </Text>
            </View>
            <View
              style={{
                height: 8,
                backgroundColor: "#f0f0f0",
                borderRadius: 9,
                overflow: "hidden",
              }}
            >
              <Animated.View
                style={{
                  height: "100%",
                  width: `${percentage}%`,
                  backgroundColor: item.color,
                  borderRadius: 9,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
});

const COLORS = {
  completed: "#10B981",
  assigned: "#3B82F6",
  pending: "#F59E0B",
  approval: "#8B5CF6",
};

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem("backend_url");
  return stored || "";
};

export default function Dashboard() {
  const router = useRouter();
  const [formsCompleted, setFormsCompleted] = useState([]);
  const [formsAssigned, setFormsAssigned] = useState([]);
  const [formsToApprove, setFormsToApprove] = useState([]);
  const [myFormsApprovalStatus, setMyFormsApprovalStatus] = useState([]);
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  
  // ✅ OPTIMIZACIÓN: Calcular formsPending con useMemo en lugar de useEffect + useState
  const formsPending = useMemo(() => {
    const completedIds = new Set(formsCompleted.map((f) => f.id));
    return formsAssigned.filter((f) => !completedIds.has(f.id));
  }, [formsCompleted, formsAssigned]);

  // Animated values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  // Memoize calculated values
  const completionRate = useMemo(
    () =>
      formsAssigned.length > 0
        ? Math.round((formsCompleted.length / formsAssigned.length) * 100)
        : 0,
    [formsCompleted.length, formsAssigned.length]
  );

  const pendingApprovals = useMemo(
    () =>
      formsToApprove.filter(
        (form) => form.your_approval_status?.status === "pendiente"
      ),
    [formsToApprove]
  );

  // Memoize formatDate function
  const formatDate = useCallback((dateString) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  // Memoize navigation handler
  const handleNavigateToForm = useCallback(
    (form) => {
      router.push({
        pathname: "/format-screen",
        params: {
          id: form.id,
          created_at: form.created_at,
          title: form.title,
        },
      });
    },
    [router]
  );

  useEffect(() => {
    const loadData = async () => {
      // Start animations immediately
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      try {
        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          setLoading(false);
          return;
        }

        const backendUrl = await getBackendUrl();

        // ✅ OPTIMIZACIÓN: Cargar todos los datos primero, luego hacer 1 solo setState batch
        let userInfoData = null;
        let completedForms = [];
        let assignedForms = [];
        let approvalForms = [];
        let approvalStatusData = [];

        // Cargar info de usuario
        try {
          const userInfoStored =
            await AsyncStorage.getItem("user_info_offline");
          if (userInfoStored) {
            userInfoData = JSON.parse(userInfoStored);
          }
        } catch (e) {
          console.warn("Error cargando user info:", e);
        }

        // Obtener formularios completados
        try {
          const response = await fetch(
            `${backendUrl}/forms/users/completed_forms`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (response.ok) {
            const data = await response.json();
            completedForms = data || [];
          }
        } catch (err) {
          console.error("Error obteniendo formularios completados:", err);
        }

        // Obtener formularios asignados
        try {
          const response = await fetch(
            `${backendUrl}/forms/users/form_by_user`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (response.ok) {
            const data = await response.json();
            assignedForms = data || [];
          }
        } catch (err) {
          console.error("Error obteniendo formularios asignados:", err);
        }

        // Obtener formularios por aprobar
        try {
          const response = await fetch(
            `${backendUrl}/forms/user/assigned-forms-with-responses`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (response.ok) {
            const data = await response.json();
            approvalForms = data || [];
          }
        } catch (err) {
          console.error("Error obteniendo formularios por aprobar:", err);
        }

        // Obtener estado de aprobación de mis formularios
        try {
          if (completedForms.length > 0) {
            for (const form of completedForms) {
              try {
                const responseData = await fetch(
                  `${backendUrl}/forms/responses/?form_id=${form.id}`,
                  {
                    headers: { Authorization: `Bearer ${token}` },
                  }
                );

                if (responseData.ok) {
                  const responses = await responseData.json();
                  if (responses && responses.length > 0) {
                    const latestResponse = responses[responses.length - 1];
                    approvalStatusData.push({
                      form_id: form.id,
                      form_title: form.title,
                      form_description: form.description,
                      response_id: latestResponse.response_id,
                      submitted_at: latestResponse.submitted_at,
                      approval_status: latestResponse.approval_status,
                      message: latestResponse.message,
                      approvals: latestResponse.approvals || [],
                    });
                  }
                }
              } catch (err) {
                console.error(
                  `Error obteniendo respuestas para formulario ${form.id}:`,
                  err
                );
              }
            }
          }
        } catch (err) {
          console.error("Error obteniendo estado de aprobaciones:", err);
        }

        // ✅ BATCHING: Actualizar todos los estados de una vez usando React 18 automatic batching
        // React 18 agrupa automáticamente los setState dentro de async functions
        setUserInfo(userInfoData);
        setFormsCompleted(completedForms);
        setFormsAssigned(assignedForms);
        setFormsToApprove(approvalForms);
        setMyFormsApprovalStatus(approvalStatusData);
        setLoading(false);
      } catch (error) {
        console.error("Error cargando datos del dashboard:", error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <LinearGradient
      colors={["#4B34C7", "#4B34C7"]}
      style={styles.fullBackground}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.headerContent}>
            <MaterialIcons name="dashboard" size={24} color="#12A0AF" />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Panel de Estadísticas</Text>
              <Text style={styles.headerSubtitle}>Resumen de tu actividad</Text>
            </View>
          </View>
          {userInfo && (
            <View style={styles.userBadge}>
              <Text style={styles.userName} numberOfLines={1}>
                {userInfo.name}
              </Text>
              <Text style={styles.userType}>{userInfo.user_type}</Text>
            </View>
          )}
        </Animated.View>

        {/* Stats Cards - Uno encima del otro */}
        <Animated.View
          style={[
            styles.statsColumn,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Completados */}
          <View
            style={[styles.statCard, { borderLeftColor: COLORS.completed }]}
          >
            <View style={styles.statIconContainer}>
              <MaterialIcons
                name="check-circle"
                size={16}
                color={COLORS.completed}
              />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Completados</Text>
              {loading ? (
                <View style={styles.skeletonText} />
              ) : (
                <Text style={styles.statValue}>{formsCompleted.length}</Text>
              )}
            </View>
          </View>

          {/* Total Asignados */}
          <View style={[styles.statCard, { borderLeftColor: COLORS.assigned }]}>
            <View style={styles.statIconContainer}>
              <MaterialIcons
                name="assignment"
                size={16}
                color={COLORS.assigned}
              />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Total Asignados</Text>
              {loading ? (
                <View style={styles.skeletonText} />
              ) : (
                <Text style={styles.statValue}>{formsAssigned.length}</Text>
              )}
            </View>
          </View>

          {/* Pendientes */}
          <View style={[styles.statCard, { borderLeftColor: COLORS.pending }]}>
            <View style={styles.statIconContainer}>
              <MaterialIcons
                name="access-time"
                size={16}
                color={COLORS.pending}
              />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Pendientes</Text>
              {loading ? (
                <View style={styles.skeletonText} />
              ) : (
                <Text style={styles.statValue}>{formsPending.length}</Text>
              )}
            </View>
          </View>

          {/* Por Aprobar */}
          <View style={[styles.statCard, { borderLeftColor: COLORS.approval }]}>
            <View style={styles.statIconContainer}>
              <MaterialIcons
                name="rate-review"
                size={16}
                color={COLORS.approval}
              />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Por Aprobar</Text>
              {loading ? (
                <View style={styles.skeletonText} />
              ) : (
                <Text style={styles.statValue}>{pendingApprovals.length}</Text>
              )}
            </View>
          </View>

          {/* Tasa de Completion */}
          <View style={[styles.statCardWide, { borderLeftColor: "#12A0AF" }]}>
            <View style={styles.statIconContainer}>
              <MaterialIcons name="trending-up" size={16} color="#12A0AF" />
            </View>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <Text style={styles.statLabel}>Completion</Text>
                {loading ? (
                  <View style={styles.skeletonText} />
                ) : (
                  <Text style={styles.statValue}>{completionRate}%</Text>
                )}
              </View>
              <View style={styles.progressBar}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: loading ? "0%" : `${completionRate}%`,
                      backgroundColor: COLORS.completed,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Sección de Gráficos */}
        <View style={styles.chartsSection}>
          {/* Gráfico Circular */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <MaterialIcons name="pie-chart" size={14} color="#12A0AF" />
              <Text style={styles.chartTitle}>Distribución</Text>
            </View>
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <PieChart
                size={Math.min(width * 0.5, 180)}
                data={[
                  {
                    name: "Completados",
                    value: formsCompleted.length,
                    color: COLORS.completed,
                  },
                  {
                    name: "Pendientes",
                    value: formsPending.length,
                    color: COLORS.pending,
                  },
                  {
                    name: "Por Aprobar",
                    value: pendingApprovals.length,
                    color: COLORS.approval,
                  },
                ].filter((item) => item.value > 0)}
              />
            </View>
          </View>

          {/* Gráfico de Barras */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <MaterialIcons name="bar-chart" size={14} color="#12A0AF" />
              <Text style={styles.chartTitle}>Comparación</Text>
            </View>
            <HorizontalBarChart
              maxValue={Math.max(
                formsCompleted.length,
                formsPending.length,
                pendingApprovals.length,
                formsAssigned.length
              )}
              data={[
                {
                  name: "Completados",
                  value: formsCompleted.length,
                  color: COLORS.completed,
                },
                {
                  name: "Pendientes",
                  value: formsPending.length,
                  color: COLORS.pending,
                },
                {
                  name: "Por Aprobar",
                  value: pendingApprovals.length,
                  color: COLORS.approval,
                },
                {
                  name: "Total",
                  value: formsAssigned.length,
                  color: COLORS.assigned,
                },
              ]}
            />
          </View>
        </View>

        {/* Formularios Completados */}
        <Animated.View
          style={[
            styles.section,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: COLORS.completed },
            ]}
          >
            <MaterialIcons name="check-circle" size={14} color="#fff" />
            <Text style={styles.sectionTitle}>
              Completados ({formsCompleted.length})
            </Text>
          </View>
          <View style={styles.sectionContent}>
            {loading ? (
              <>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </>
            ) : formsCompleted.length > 0 ? (
              <ScrollView
                style={styles.listScrollView}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                {formsCompleted.map((form) => (
                  <TouchableOpacity
                    key={form.id}
                    style={styles.listItem}
                    onPress={() => handleNavigateToForm(form)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.listItemContent}>
                      <Text style={styles.listItemTitle} numberOfLines={1}>
                        {form.title}
                      </Text>
                      <Text style={styles.listItemSubtitle} numberOfLines={1}>
                        {form.description}
                      </Text>
                      <Text style={styles.listItemDate}>
                        {formatDate(form.created_at)}
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color="#999"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="inbox" size={28} color="#ccc" />
                <Text style={styles.emptyStateText}>
                  No has completado formularios
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Formularios Pendientes */}
        <Animated.View
          style={[
            styles.section,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <View
            style={[styles.sectionHeader, { backgroundColor: COLORS.pending }]}
          >
            <MaterialIcons name="access-time" size={14} color="#fff" />
            <Text style={styles.sectionTitle}>
              Pendientes ({formsPending.length})
            </Text>
          </View>
          <View style={styles.sectionContent}>
            {loading ? (
              <>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </>
            ) : formsPending.length > 0 ? (
              <ScrollView
                style={styles.listScrollView}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                {formsPending.map((form) => (
                  <TouchableOpacity
                    key={form.id}
                    style={styles.listItem}
                    onPress={() => handleNavigateToForm(form)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.listItemContent}>
                      <Text style={styles.listItemTitle} numberOfLines={1}>
                        {form.title}
                      </Text>
                      <Text style={styles.listItemSubtitle} numberOfLines={1}>
                        {form.description}
                      </Text>
                      <Text style={styles.listItemDate}>
                        {formatDate(form.created_at)}
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color="#999"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="done-all" size={28} color="#10B981" />
                <Text style={styles.emptyStateSuccess}>
                  ¡Todos completados! 🎉
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Formularios Por Aprobar */}
        <Animated.View
          style={[
            styles.section,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <View
            style={[styles.sectionHeader, { backgroundColor: COLORS.approval }]}
          >
            <MaterialIcons name="rate-review" size={14} color="#fff" />
            <Text style={styles.sectionTitle}>
              Por Aprobar ({pendingApprovals.length})
            </Text>
          </View>
          <View style={styles.sectionContent}>
            {loading ? (
              <>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </>
            ) : pendingApprovals.length > 0 ? (
              <ScrollView
                style={styles.listScrollView}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                {pendingApprovals.map((form) => (
                  <TouchableOpacity
                    key={`${form.form_id}-${form.response_id}`}
                    style={styles.listItem}
                    onPress={() =>
                      router.push(
                        `/approval-detail?form_id=${form.form_id}&response_id=${form.response_id}`
                      )
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.listItemContent}>
                      <Text style={styles.listItemTitle} numberOfLines={1}>
                        {form.form_title}
                      </Text>
                      <Text style={styles.listItemSubtitle} numberOfLines={1}>
                        Por: {form.submitted_by.name}
                      </Text>
                      <Text style={styles.listItemDate}>
                        {formatDate(form.submitted_at)}
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color="#999"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="inbox" size={28} color="#ccc" />
                <Text style={styles.emptyStateText}>
                  No hay pendientes de aprobación
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fullBackground: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#4B34C7",
  },
  loadingText: {
    color: "#fff",
    marginTop: 12,
    fontSize: 16,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  header: {
    backgroundColor: "#fff",
    marginHorizontal: width * 0.04,
    marginTop: height * 0.02,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  userBadge: {
    backgroundColor: "#f0f0f0",
    padding: 8,
    borderRadius: 8,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  userType: {
    fontSize: 12,
    color: "#12A0AF",
    marginTop: 2,
  },
  statsColumn: {
    width: "100%",
    paddingHorizontal: width * 0.04,
    marginBottom: 12,
    flexDirection: "column",
  },
  statCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 45,
    borderLeftWidth: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  statCardWide: {
    width: "100%",
    borderLeftColor: "#12A0AF",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    minHeight: 45,
    borderLeftWidth: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  statIconContainer: {
    marginRight: 10,
  },
  statContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#333",
  },
  statLabel: {
    fontSize: 10,
    color: "#666",
    textTransform: "uppercase",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    marginTop: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  chartsSection: {
    marginHorizontal: width * 0.04,
    marginBottom: 12,
    gap: 10,
  },
  chartCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    marginBottom: 10,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 5,
  },
  chartTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#333",
  },
  section: {
    marginHorizontal: width * 0.04,
    marginBottom: 12,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    gap: 5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
  },
  sectionContent: {
    padding: 8,
  },
  listScrollView: {
    maxHeight: 300,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  listItemSubtitle: {
    fontSize: 9,
    color: "#666",
    marginBottom: 2,
  },
  listItemDate: {
    fontSize: 8,
    color: "#999",
  },
  skeletonText: {
    width: 40,
    height: 18,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
  },
  skeletonListItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  skeletonTitle: {
    width: "80%",
    height: 11,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    marginBottom: 6,
  },
  skeletonSubtitle: {
    width: "60%",
    height: 9,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    marginBottom: 6,
  },
  skeletonDate: {
    width: "40%",
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
  },
  emptyState: {
    alignItems: "center",
    padding: 16,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 11,
    color: "#999",
    textAlign: "center",
  },
  emptyStateSuccess: {
    marginTop: 8,
    fontSize: 11,
    color: "#10B981",
    fontWeight: "600",
    textAlign: "center",
  },
});
