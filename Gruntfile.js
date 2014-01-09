module.exports = function(grunt) {

  grunt.initConfig({
    env: {
      dev: {
      },
      test: {
        NODE_ENV:          'test'
      },
      // For running not on heroku with prod params - heroku does not use these.
      prod: {
      }
    },
    jshint: {
      all: ['Gruntfile.js', 'lib/**/*.js', 'test/**/*.js']
    },
    mochacli: {
      all: ['test/**/*.js'],
      options: {
        reporter: 'mocha-unfunk-reporter',
        ui: 'tdd'
      }
    },
    watch: {
      files: ['lib/**/*.js', 'test/**/*.js'],
      tasks: 'test'
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-mocha-cli');
  grunt.loadNpmTasks('grunt-env');
  grunt.registerTask('test', ['env:test', 'mochacli']);
  grunt.registerTask('dev', ['env:dev', 'exec:dev']);
  grunt.registerTask('prod', ['env:prod', 'exec:dev']);
};

// vim: set et sw=2 ts=2 colorcolumn=80:
