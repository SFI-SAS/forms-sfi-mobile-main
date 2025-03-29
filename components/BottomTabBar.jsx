import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import Home from "./Home";
import MyForms from "./MyForms";
import { FontAwesome } from "@expo/vector-icons";

const Tab = createBottomTabNavigator();

export default function BottomTabBar() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === "Home") {
              iconName = "home";
            } else if (route.name === "MyForms") {
              iconName = "file";
            }
            return <FontAwesome name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: "blue",
          tabBarInactiveTintColor: "gray",
          headerShown: false, // Ocultar encabezado superior
        })}
      >
        <Tab.Screen name="Home" component={Home} />
        <Tab.Screen name="MyForms" component={MyForms} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
