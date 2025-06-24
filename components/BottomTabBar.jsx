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

const { width } = Dimensions.get("window");

export default function BottomTabBar({ activeTab, onTabPress }) {
  return (
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
            size={width * 0.07}
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
            size={width * 0.07}
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
        last // Custom prop to push to the right
      />
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
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 6,
    paddingBottom: Platform.OS === "ios" ? 18 : 8,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    zIndex: 10,
    width: "100%",
  },
  tabBarButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "column",
    marginHorizontal: 2,
    minWidth: width * 0.15,
    maxWidth: width * 0.19,
  },
  tabBarButtonActive: {
    backgroundColor: "#4B34C722",
  },
  tabBarButtonDanger: {
    backgroundColor: "#ef444422",
  },
  tabBarButtonLast: {
    marginLeft: "auto",
    minWidth: width * 0.17,
    maxWidth: width * 0.22,
  },
  tabBarIcon: {
    width: width * 0.07,
    height: width * 0.07,
    marginBottom: 2,
    tintColor: "#4B34C7",
    resizeMode: "contain",
  },
  tabBarLabel: {
    fontSize: width * 0.032,
    color: "#4B34C7",
    fontWeight: "bold",
  },
  tabBarLabelActive: {
    color: "#12A0AF",
  },
  tabBarLabelDanger: {
    color: "#ef4444",
  },
});
