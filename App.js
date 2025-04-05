import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import { Main } from "./components/Main";
import Home from "./components/Home";
import FormatScreen from "./components/FormatScreen";

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Main">
        <Stack.Screen
          name="Main"
          component={Main} // Ensure Main is registered here
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Home"
          component={Home} // Ensure Home is registered here
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FormatScreen"
          component={FormatScreen}
          options={{ title: "Format Details" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
