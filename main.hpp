#pragma once
#include <string>
#include <variant>

using std::string;

template <typename T> using result = std::variant<T, string>;

class Config {
  string image;
};
