import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import NetInfo from "@react-native-community/netinfo";

const { width, height } = Dimensions.get("window");

// Componente Avatar reutilizado de Home.jsx
const UserAvatar = ({ name }) => {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";
  return (
    <View style={styles.avatarCircle}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
};

const DrawerMenu = ({
  activeRoute,
  onNavigate,
  onClose,
  userInfo,
  isOffline,
}) => {
  const insets = useSafeAreaInsets();

  // Animaciones para cada ítem del menú
  const fadeAnims = useRef(
    Array(6)
      .fill(0)
      .map(() => new Animated.Value(0))
  ).current;

  const slideAnims = useRef(
    Array(6)
      .fill(0)
      .map(() => new Animated.Value(-50))
  ).current;

  useEffect(() => {
    // Animar entrada de los ítems secuencialmente
    const animations = fadeAnims.map((anim, index) => {
      return Animated.parallel([
        Animated.timing(anim, {
          toValue: 1,
          duration: 300,
          delay: index * 50,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnims[index], {
          toValue: 0,
          tension: 50,
          friction: 8,
          delay: index * 50,
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.stagger(50, animations).start();
  }, []);

  const menuItems = [
    {
      id: "home",
      label: "Home",
      icon: "home",
      route: "/home",
      description: "Dashboard principal",
    },
    {
      id: "forms",
      label: "Forms",
      icon: "folder",
      route: "/forms",
      description: "Explorar formularios",
    },
    {
      id: "my-forms",
      label: "Submitted Forms",
      icon: "check-circle",
      route: "/my-forms",
      description: "Formularios enviados",
    },
    {
      id: "pending-forms",
      label: "Pending Forms",
      icon: "sync",
      route: "/pending-forms",
      description: "Formularios pendientes",
    },
    {
      id: "approvals",
      label: "Approvals",
      icon: "approval",
      route: "/approvals",
      description: "Aprobaciones pendientes",
    },
    {
      id: "settings",
      label: "Settings",
      icon: "settings",
      route: "/settings",
      description: "Configuración",
    },
  ];

  const handleItemPress = (item) => {
    onNavigate(item.route, item.id);
    setTimeout(() => onClose(), 300);
  };

  const handleLogout = () => {
    onNavigate("logout");
    setTimeout(() => onClose(), 300);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header con gradiente - Estilo de Home.jsx */}
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
        style={styles.header}
      >
        <View style={styles.headerContent}>
          {/* Avatar con iniciales */}
          <UserAvatar name={userInfo?.name} />

          {/* User Info detallada */}
          <View style={styles.userInfoWrapper}>
            <Text style={styles.userName} numberOfLines={1}>
              {userInfo?.name || "Usuario"}
            </Text>

            <View style={styles.userInfoColumn}>
              <View style={styles.userInfoRow}>
                <Text style={styles.userInfoLabel}>Email: </Text>
                <Text style={styles.userInfoValue} numberOfLines={1}>
                  {userInfo?.email || "N/A"}
                </Text>
              </View>

              <View style={styles.userInfoRow}>
                <Text style={styles.userInfoLabel}>Document: </Text>
                <Text style={styles.userInfoValue}>
                  {userInfo?.num_document || "N/A"}
                </Text>
              </View>

              <View style={styles.userInfoRow}>
                <Text style={styles.userInfoLabel}>Phone: </Text>
                <Text style={styles.userInfoValue}>
                  {userInfo?.telephone || "N/A"}
                </Text>
              </View>

              <View style={styles.userInfoRow}>
                <Text style={styles.userInfoLabel}>Type: </Text>
                <Text style={styles.userInfoValue}>
                  {userInfo?.user_type || "N/A"}
                </Text>
              </View>
            </View>
          </View>

          {/* Status Badge */}
          <View style={styles.statusBadgeContainer}>
            <View
              style={[
                styles.statusBadge,
                isOffline ? styles.statusOffline : styles.statusOnline,
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {isOffline ? "Offline" : "Online"}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Menu Items con animación */}
      <ScrollView
        style={styles.menuContainer}
        contentContainerStyle={styles.menuContent}
        showsVerticalScrollIndicator={false}
      >
        {menuItems.map((item, index) => {
          const isActive = activeRoute === item.id;
          return (
            <Animated.View
              key={item.id}
              style={{
                opacity: fadeAnims[index],
                transform: [{ translateX: slideAnims[index] }],
              }}
            >
              <TouchableOpacity
                style={[
                  styles.menuItem,
                  isActive && styles.menuItemActive,
                  index === 0 && styles.menuItemFirst,
                ]}
                onPress={() => handleItemPress(item)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.iconContainer,
                    isActive && styles.iconContainerActive,
                  ]}
                >
                  <MaterialIcons
                    name={item.icon}
                    size={24}
                    color={isActive ? "#12A0AF" : "#64748b"}
                  />
                </View>
                <View style={styles.menuItemText}>
                  <Text
                    style={[
                      styles.menuItemLabel,
                      isActive && styles.menuItemLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  <Text style={styles.menuItemDescription}>
                    {item.description}
                  </Text>
                </View>
                {isActive && <View style={styles.activeIndicator} />}
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <MaterialIcons name="logout" size={24} color="#EF4444" />
          </View>
          <View style={styles.menuItemText}>
            <Text style={styles.logoutLabel}>Logout</Text>
            <Text style={styles.menuItemDescription}>Cerrar sesión</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.footerText}>Forms SFI Mobile</Text>
        <Text style={styles.footerVersion}>v1.0.0</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomRightRadius: width * 0.04,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 6,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  // Avatar styles de Home.jsx
  avatarCircle: {
    width: width * 0.14,
    height: width * 0.14,
    borderRadius: width * 0.07,
    backgroundColor: "#12A0AF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    shadowColor: "#12A0AF",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  avatarText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.055,
  },
  userInfoWrapper: {
    flex: 1,
  },
  userName: {
    fontSize: width * 0.045,
    fontWeight: "bold",
    color: "#12A0AF",
    marginBottom: 4,
    letterSpacing: 0.2,
    textShadowColor: "#fff8",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  userInfoColumn: {
    flexDirection: "column",
    marginTop: 2,
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  userInfoLabel: {
    fontSize: width * 0.03,
    color: "#12A0AF",
    fontWeight: "bold",
  },
  userInfoValue: {
    fontSize: width * 0.03,
    color: "#222",
    marginLeft: 2,
    flexShrink: 1,
  },
  statusBadgeContainer: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    marginLeft: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 60,
    alignItems: "center",
  },
  statusOnline: {
    backgroundColor: "#10B981",
  },
  statusOffline: {
    backgroundColor: "#EF4444",
  },
  statusBadgeText: {
    fontSize: width * 0.028,
    fontWeight: "bold",
    color: "#fff",
  },
  menuContainer: {
    flex: 1,
  },
  menuContent: {
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    borderRadius: 12,
    position: "relative",
  },
  menuItemFirst: {
    marginTop: 8,
  },
  menuItemActive: {
    backgroundColor: "#E0F2F5",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  iconContainerActive: {
    backgroundColor: "#BFECF3",
  },
  menuItemText: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 2,
  },
  menuItemLabelActive: {
    color: "#12A0AF",
    fontWeight: "700",
  },
  menuItemDescription: {
    fontSize: 12,
    color: "#64748B",
  },
  activeIndicator: {
    position: "absolute",
    right: 0,
    top: "50%",
    marginTop: -16,
    width: 4,
    height: 32,
    backgroundColor: "#12A0AF",
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 16,
    marginHorizontal: 20,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    borderRadius: 12,
  },
  logoutLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EF4444",
    marginBottom: 2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  footerText: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    fontWeight: "600",
  },
  footerVersion: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 4,
  },
});

export default DrawerMenu;
