import { Image } from "react-native";

export const Logo = (props) => (
  <Image
    source={require("../assets/logo.png")}
    style={{ width: 300, height: 50, borderRadius: 20 }}
    resizeMode="contain"
    {...props}
  />
);
