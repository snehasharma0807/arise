import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        jsx: "react-jsx",
        module: "commonjs",
        moduleResolution: "node",
        esModuleInterop: true,
        strict: true,
      },
    }],
  },
  testMatch: ["**/__tests__/**/*.test.(ts|tsx)"],
  collectCoverageFrom: [
    "lib/**/*.ts",
    "hooks/**/*.ts",
    "components/**/*.tsx",
    "!**/*.d.ts",
  ],
};

export default config;
