import React from "react";
import {
  View,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeIcon } from "./Icons";
import { MaterialIcons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

// Detecta si es tablet o teléfono
const isTablet = width >= 768;
const isSmallDevice = width < 375;

export default function BottomTabBar({ activeTab, onTabPress }) {
  const insets = useSafeAreaInsets();
  
  // Usa el inset bottom real del dispositivo + un pequeño margen
  const bottomOffset = Math.max(insets.bottom, 8) + 8;
  
  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: bottomOffset }]}>
      {/* Sombra superior sutil para efecto flotante */}
      <View style={styles.shadowLayer} />
      
      <View style={styles.tabBarContainer}>
        {/* Indicador visual superior (línea decorativa) */}
        <View style={styles.topIndicator} />
        
        <View style={styles.tabBarInner}>
          <TabBarButton
            icon={<HomeIcon color={activeTab === "home" ? "#12A0AF" : "#64748b"} />}
            label="Home"
            active={activeTab === "home"}
            onPress={() => onTabPress("home")}
          />
          <TabBarButton
            icon={
              <Image
                source={require("../assets/fact_check_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
                style={[
                  styles.tabBarIcon,
                  { tintColor: activeTab === "my-forms" ? "#12A0AF" : "#64748b" },
                ]}
              />
            }
            label="Submitted"
            active={activeTab === "my-forms"}
            onPress={() => onTabPress("my-forms")}
          />
          <TabBarButton
            icon={
              <Image
                source={require("../assets/sync_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
                style={[
                  styles.tabBarIcon,
                  { tintColor: activeTab === "pending-forms" ? "#12A0AF" : "#64748b" },
                ]}
              />
            }
            label="Pending"
            active={activeTab === "pending-forms"}
            onPress={() => onTabPress("pending-forms")}
          />
          <TabBarButton
            icon={
              <MaterialIcons
                name="check-circle"
                size={isTablet ? 28 : isSmallDevice ? 20 : 24}
                color={activeTab === "approvals" ? "#12A0AF" : "#64748b"}
              />
            }
            label="Approvals"
            active={activeTab === "approvals"}
            onPress={() => onTabPress("approvals")}
          />
          <TabBarButton
            icon={
              <MaterialIcons
                name="settings"
                size={isTablet ? 28 : isSmallDevice ? 20 : 24}
                color={activeTab === "settings" ? "#12A0AF" : "#64748b"}
              />
            }
            label="Settings"
            active={activeTab === "settings"}
            onPress={() => onTabPress("settings")}
          />
          <TabBarButton
            icon={
              <Image
                source={require("../assets/logout_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24 (1).png")}
                style={[
                  styles.tabBarIcon,
                  { tintColor: activeTab === "logout" ? "#ef4444" : "#64748b" },
                ]}
              />
            }
            label="Logout"
            active={activeTab === "logout"}
            onPress={() => onTabPress("logout")}
            danger
          />
        </View>
      </View>
    </View>
  );
}

function TabBarButton({ icon, label, active, onPress, danger }) {
  return (
    <TouchableOpacity
      style={[
        styles.tabBarButton,
        active && styles.tabBarButtonActive,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Contenedor del ícono con efecto de escala */}
      <View style={[
        styles.iconContainer,
        active && styles.iconContainerActive,
        danger && active && styles.iconContainerDanger,
      ]}>
        {icon}
      </View>
      
      {/* Label con mejor tipografía */}
      <Text
        style={[
          styles.tabBarLabel,
          active && (danger ? styles.tabBarLabelDanger : styles.tabBarLabelActive),
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit={true}
        minimumFontScale={0.65}
      >
        {label}
      </Text>
      
      {/* Indicador de tab activa - punto inferior */}
      {active && (
        <View style={[
          styles.activeIndicator,
          danger && styles.activeIndicatorDanger,
        ]} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: width * 0.03,
    right: width * 0.03,
    bottom: 0,
    zIndex: 1000,
    paddingHorizontal: isTablet ? 20 : 0,
  },
  shadowLayer: {
    position: 'absolute',
    top: -8,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: 'transparent',
    shadowColor: "#4B34C7",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -4 },
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  tabBarContainer: {
    position: 'relative',
    backgroundColor: "#ffffff",
    borderRadius: isTablet ? 28 : 24,
    paddingTop: 2,
    paddingBottom: Platform.OS === "ios" ? 4 : 2,
    paddingHorizontal: isTablet ? 16 : width * 0.015,
    elevation: 24,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    borderWidth: 1,
    borderColor: "#f1f5f9",
    overflow: 'hidden',
  },
  topIndicator: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 3,
    backgroundColor: '#12A0AF',
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    opacity: 0.6,
  },
  tabBarInner: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: isTablet ? 8 : 4,
    backgroundColor: "transparent",
    borderRadius: isTablet ? 24 : 20,
    paddingHorizontal: isTablet ? 12 : 4,
  },
  tabBarButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: isTablet ? 8 : 6,
    paddingHorizontal: isSmallDevice ? 2 : 4,
    borderRadius: 16,
    position: 'relative',
    minHeight: isTablet ? 65 : isSmallDevice ? 50 : 56,
    maxWidth: isTablet ? width * 0.12 : width * 0.14,
  },
  tabBarButtonActive: {
    backgroundColor: "rgba(18, 160, 175, 0.10)",
    transform: [{ scale: 1.02 }],
  },
  iconContainer: {
    marginBottom: isTablet ? 4 : 3,
    alignItems: 'center',
    justifyContent: 'center',
    width: isTablet ? 36 : isSmallDevice ? 26 : 30,
    height: isTablet ? 36 : isSmallDevice ? 26 : 30,
    borderRadius: isTablet ? 18 : 15,
    backgroundColor: 'transparent',
    transition: 'all 0.2s ease',
  },
  iconContainerActive: {
    backgroundColor: "transparent",
    transform: [{ scale: 1.08 }],
  },
  iconContainerDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  tabBarIcon: {
    width: isTablet ? 26 : isSmallDevice ? 18 : 22,
    height: isTablet ? 26 : isSmallDevice ? 18 : 22,
    resizeMode: "contain",
  },
  tabBarLabel: {
    fontSize: isTablet ? width * 0.018 : isSmallDevice ? width * 0.025 : width * 0.027,
    color: "#64748b",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  tabBarLabelActive: {
    color: "#12A0AF",
    fontWeight: "700",
  },
  tabBarLabelDanger: {
    color: "#ef4444",
    fontWeight: "700",
  },
  activeIndicator: {
    position: 'absolute',
    bottom: isTablet ? 4 : 3,
    width: isTablet ? 36 : 28,
    height: isTablet ? 4 : 3,
    backgroundColor: "#12A0AF",
    borderRadius: 2,
    opacity: 0.9,
  },
  activeIndicatorDanger: {
    backgroundColor: "#ef4444",
  },
});