cmake_minimum_required(VERSION 4.0.0)

project(cajon LANGUAGES CXX)

include(GNUInstallDirs)

find_package(PkgConfig REQUIRED)

set(main cajon)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(${main} main.cpp)

pkg_check_modules(Lua REQUIRED IMPORTED_TARGET GLOBAL lua)

find_package(CLI11 CONFIG REQUIRED)

target_link_libraries(${main} PRIVATE PkgConfig::Lua)
target_link_libraries(${main} PRIVATE CLI11::CLI11)

target_compile_options(${main} PRIVATE -Wall -Wpedantic)

target_include_directories(${main} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

install(TARGETS ${main}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
