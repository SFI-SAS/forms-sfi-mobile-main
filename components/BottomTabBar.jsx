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
import { HomeIcon } from "./Icons";
import { MaterialIcons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

export default function BottomTabBar({ activeTab, onTabPress }) {
  // Much more aggressive spacing from bottom
  const getBottomOffset = () => {
    if (Platform.OS === 'ios') {
      return height > 800 ? 50 : 35; // iPhone X+ gets even more space
    } else {
      return height > 700 ? 45 : 30; // Android with gesture navigation
    }
  };
  
  return (
    <View style={[styles.tabBarWrapper, { bottom: getBottomOffset() }]}>
      <View style={styles.tabBarContainer}>
        <TabBarButton
          icon={<HomeIcon color={activeTab === "home" ? "#12A0AF" : "#4B34C7"} />}
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
                activeTab === "my-forms" && { tintColor: "#12A0AF" },
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
                activeTab === "pending-forms" && { tintColor: "#12A0AF" },
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
              size={width * 0.06}
              color={activeTab === "approvals" ? "#12A0AF" : "#4B34C7"}
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
              size={width * 0.06}
              color={activeTab === "settings" ? "#12A0AF" : "#4B34C7"}
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
                activeTab === "logout" && { tintColor: "#ef4444" },
              ]}
            />
          }
          label="Logout"
          active={activeTab === "logout"}
          onPress={() => onTabPress("logout")}
          danger
          last
        />
      </View>
    </View>
  );
}

function TabBarButton({ icon, label, active, onPress, danger, last }) {
  return (
    <TouchableOpacity
      style={[
        styles.tabBarButton,
        active && styles.tabBarButtonActive,
        danger && styles.tabBarButtonDanger,
        last && styles.tabBarButtonLast,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {icon}
      <Text
        style={[
          styles.tabBarLabel,
          active && styles.tabBarLabelActive,
          danger && styles.tabBarLabelDanger,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit={true}
        minimumFontScale={0.7}
        ellipsizeMode="clip"
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: 15,
    right: 15,
    zIndex: 1000,
  },
  tabBarContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20, // Fully rounded floating bar
    paddingVertical: 8,
    paddingHorizontal: 12,
    elevation: 20, // Higher elevation for floating effect
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  tabBarButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 12,
    flexDirection: "column",
    marginHorizontal: 1,
    minWidth: width * 0.12,
    maxWidth: width * 0.15,
    minHeight: 50,
  },
  tabBarButtonActive: {
    backgroundColor: "#4B34C720",
  },
  tabBarButtonDanger: {
    backgroundColor: "#ef444415",
  },
  tabBarButtonLast: {
    marginLeft: 4,
    minWidth: width * 0.13,
    maxWidth: width * 0.15,
  },
  tabBarIcon: {
    width: width * 0.055,
    height: width * 0.055,
    marginBottom: 2,
    tintColor: "#4B34C7",
    resizeMode: "contain",
  },
  tabBarLabel: {
    fontSize: width * 0.026,
    color: "#4B34C7",
    fontWeight: "600",
    width: "100%",
    textAlign: "center",
    marginTop: 1,
  },
  tabBarLabelActive: {
    color: "#12A0AF",
    fontWeight: "700",
  },
  tabBarLabelDanger: {
    color: "#ef4444",
  },
});